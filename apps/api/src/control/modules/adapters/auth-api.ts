/**
 * Authenticated / SaaS / enrolled-ingest adapters.
 * Live calls only when tenant env keys are present — never invent secrets.
 * Read-only / posture / ingest; no phishing send, no chaos inject, no exploit.
 */
import { getModuleDefinition } from "../registry";
import type { ModuleAdapter, ModuleDefinition, ModuleRunContext } from "../types";
import {
  apexTargets,
  assertAllTargetsInScope,
  baseResult,
  ctxFetch,
  envHasAny,
  hashJson,
  runKeyedAdapter,
  sleepRate,
  stubNeedsConfig,
} from "../helpers";

function mustDef(id: string): ModuleDefinition {
  const d = getModuleDefinition(id);
  if (!d) throw new Error(`module def missing: ${id}`);
  return d;
}

async function azureClientCredentials(
  values: Record<string, string>,
  fetchFn: typeof fetch,
  scope = "https://graph.microsoft.com/.default",
): Promise<string> {
  const tenant = values.AZURE_TENANT_ID;
  const clientId = values.AZURE_CLIENT_ID;
  const secret = values.AZURE_CLIENT_SECRET;
  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: secret,
    scope,
    grant_type: "client_credentials",
  });
  const res = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`Azure token failed: ${json.error ?? res.status}`);
  }
  return json.access_token;
}

async function graphGet(
  token: string,
  path: string,
  fetchFn: typeof fetch,
): Promise<unknown> {
  const res = await fetchFn(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, result: json };
}

function azureGraphAdapter(
  moduleId: string,
  source: string,
  graphPath: string | ((ctx: ModuleRunContext) => string),
): ModuleAdapter {
  return async (ctx) => {
    const def = mustDef(moduleId);
    return runKeyedAdapter({
      def,
      ctx,
      requiredKeys: ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET"],
      source,
      mockEvidence: { graphPath: typeof graphPath === "string" ? graphPath : "(dynamic)" },
      fetchLive: async ({ values, fetch: fetchFn, ctx: c }) => {
        const token = await azureClientCredentials(values, fetchFn);
        const path =
          typeof graphPath === "function" ? graphPath(c) : graphPath;
        return graphGet(token, path, fetchFn);
      },
    });
  };
}

/** Host-scoped GET with API key header / query. */
function hostKeyedGet(opts: {
  moduleId: string;
  source: string;
  requiredKeys: string[];
  anyOfKeys?: string[][];
  buildUrl: (host: string, values: Record<string, string>) => string;
  buildHeaders?: (values: Record<string, string>) => Record<string, string>;
}): ModuleAdapter {
  return async (ctx) => {
    const def = mustDef(opts.moduleId);
    return runKeyedAdapter({
      def,
      ctx,
      requiredKeys: opts.requiredKeys,
      anyOfKeys: opts.anyOfKeys,
      source: opts.source,
      mockEvidence: { hosts: apexTargets(ctx) },
      fetchLive: async ({ values, fetch: fetchFn, ctx: c }) => {
        const hosts = apexTargets(c);
        const rows: unknown[] = [];
        for (const host of hosts) {
          if (c.isCancelled()) break;
          const url = opts.buildUrl(host, values);
          const headers = {
            Accept: "application/json",
            ...(opts.buildHeaders?.(values) ?? {}),
          };
          const res = await fetchFn(url, {
            headers,
            signal: AbortSignal.timeout(15_000),
          });
          const json = await res.json().catch(() => null);
          rows.push({ host, ok: res.ok, status: res.status, result: json });
          await sleepRate(c, def.rateLimitPerMinuteDefault ?? 10);
        }
        return { hosts, rows };
      },
    });
  };
}

/** Tenant-global GET (no host loop) — posture / inventory. */
function tenantKeyedGet(opts: {
  moduleId: string;
  source: string;
  requiredKeys: string[];
  anyOfKeys?: string[][];
  assertScope?: boolean;
  buildRequest: (values: Record<string, string>) => {
    url: string;
    headers?: Record<string, string>;
    method?: string;
    body?: string;
  };
}): ModuleAdapter {
  return async (ctx) => {
    const def = mustDef(opts.moduleId);
    return runKeyedAdapter({
      def,
      ctx,
      requiredKeys: opts.requiredKeys,
      anyOfKeys: opts.anyOfKeys,
      source: opts.source,
      assertScope: opts.assertScope ?? true,
      mockEvidence: { mode: "tenant-read" },
      fetchLive: async ({ values, fetch: fetchFn }) => {
        const req = opts.buildRequest(values);
        const res = await fetchFn(req.url, {
          method: req.method ?? "GET",
          headers: {
            Accept: "application/json",
            ...(req.headers ?? {}),
          },
          body: req.body,
          signal: AbortSignal.timeout(20_000),
        });
        const json = await res.json().catch(() => null);
        return { ok: res.ok, status: res.status, result: json };
      },
    });
  };
}

/** Enrolled report ingest — fetch exported JSON/CSV URL; bearer token optional. */
function enrolledIngestAdapter(
  moduleId: string,
  source: string,
  urlKey: string,
  optionalTokenKey?: string,
): ModuleAdapter {
  return async (ctx) => {
    const def = mustDef(moduleId);
    return runKeyedAdapter({
      def,
      ctx,
      requiredKeys: [urlKey],
      source,
      assertScope: false,
      mockEvidence: { ingest: true, enrolled: true },
      fetchLive: async ({ values, fetch: fetchFn, ctx: c }) => {
        const headers: Record<string, string> = {
          Accept: "application/json, text/csv, */*",
        };
        if (optionalTokenKey) {
          const tok =
            values[optionalTokenKey] ||
            envHasAny(c.env, [optionalTokenKey]);
          if (tok) headers.Authorization = `Bearer ${tok}`;
        }
        const res = await fetchFn(values[urlKey]!, {
          headers,
          signal: AbortSignal.timeout(30_000),
        });
        const text = await res.text();
        let parsed: unknown = text.slice(0, 100_000);
        try {
          parsed = JSON.parse(text);
        } catch {
          /* keep text */
        }
        return {
          ok: res.ok,
          status: res.status,
          contentType: res.headers.get("content-type"),
          payload: parsed,
          note: "Enrolled feed ingest — Atlas does not enroll or scrape government portals.",
        };
      },
    });
  };
}

// ── Passive ASM keyed ──────────────────────────────────────────────────────

export const runCensys: ModuleAdapter = hostKeyedGet({
  moduleId: "asm.censys.passive.v1",
  source: "censys",
  requiredKeys: ["CENSYS_API_ID", "CENSYS_API_SECRET"],
  buildUrl: (host) =>
    `https://search.censys.io/api/v2/hosts/search?q=${encodeURIComponent(`dns.names:${host}`)}&per_page=5`,
  buildHeaders: (v) => ({
    Authorization:
      "Basic " +
      Buffer.from(`${v.CENSYS_API_ID}:${v.CENSYS_API_SECRET}`).toString("base64"),
  }),
});

export const runShodan: ModuleAdapter = hostKeyedGet({
  moduleId: "asm.shodan.passive.v1",
  source: "shodan",
  requiredKeys: ["SHODAN_API_KEY"],
  buildUrl: (host, v) =>
    `https://api.shodan.io/dns/domain/${encodeURIComponent(host)}?key=${encodeURIComponent(v.SHODAN_API_KEY)}`,
});

export const runSecurityTrails: ModuleAdapter = hostKeyedGet({
  moduleId: "asm.securitytrails.passive.v1",
  source: "securitytrails",
  requiredKeys: ["SECURITYTRAILS_API_KEY"],
  buildUrl: (host) =>
    `https://api.securitytrails.com/v1/domain/${encodeURIComponent(host)}`,
  buildHeaders: (v) => ({ APIKEY: v.SECURITYTRAILS_API_KEY }),
});

export const runDefenderEasm = azureGraphAdapter(
  "asm.defender-easm.auth.v1",
  "defender-easm",
  // EASM is a separate Azure resource; Graph placeholder lists org domains as inventory seed.
  "/organization",
);

export const runCisaCyhy = enrolledIngestAdapter(
  "asm.cisa-cyhy.enrolled.v1",
  "cisa-cyhy-ingest",
  "CISA_CYHY_REPORT_URL",
  "CISA_CYHY_FEED_TOKEN",
);

export const runShadowserver = enrolledIngestAdapter(
  "asm.shadowserver.enrolled.v1",
  "shadowserver-ingest",
  "SHADOWSERVER_REPORT_URL",
  "SHADOWSERVER_API_KEY",
);

// ── Breach ────────────────────────────────────────────────────────────────

export const runSpyCloud: ModuleAdapter = hostKeyedGet({
  moduleId: "breach.spycloud.auth.v1",
  source: "spycloud",
  requiredKeys: ["SPYCLOUD_API_KEY"],
  buildUrl: (host) =>
    `https://api.spycloud.io/investigations-api/v2/breach/data/emails?domain=${encodeURIComponent(host)}`,
  buildHeaders: (v) => ({ "X-API-KEY": v.SPYCLOUD_API_KEY }),
});

export const runEntraIdProtection = azureGraphAdapter(
  "breach.entra-id-protection.auth.v1",
  "entra-id-protection",
  "/identityProtection/riskyUsers?$top=25",
);

// ── GitHub SCA / secrets ──────────────────────────────────────────────────

export const runDependabot: ModuleAdapter = async (ctx) => {
  const def = mustDef("sca.dependabot.auth.v1");
  const repo = envHasAny(ctx.env, ["GITHUB_REPOSITORY"]);
  return runKeyedAdapter({
    def,
    ctx,
    requiredKeys: ["GITHUB_TOKEN"],
    source: "github-dependabot",
    assertScope: false,
    mockEvidence: { alerts: [] },
    fetchLive: async ({ values, fetch: fetchFn }) => {
      if (!repo) {
        return {
          needsRepo: true,
          requiredEnv: ["GITHUB_TOKEN", "GITHUB_REPOSITORY"],
          note: "Set GITHUB_REPOSITORY=owner/name for Dependabot alerts.",
        };
      }
      const [owner, name] = repo.split("/");
      const url = `https://api.github.com/repos/${owner}/${name}/dependabot/alerts?state=open&per_page=30`;
      const res = await fetchFn(url, {
        headers: {
          Authorization: `Bearer ${values.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(20_000),
      });
      const json = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, repository: repo, result: json };
    },
  });
};

export const runGithubSecretScanning: ModuleAdapter = async (ctx) => {
  const def = mustDef("secrets.github-scanning.auth.v1");
  const repo = envHasAny(ctx.env, ["GITHUB_REPOSITORY"]);
  return runKeyedAdapter({
    def,
    ctx,
    requiredKeys: ["GITHUB_TOKEN"],
    source: "github-secret-scanning",
    assertScope: false,
    mockEvidence: { alerts: [] },
    fetchLive: async ({ values, fetch: fetchFn }) => {
      if (!repo) {
        return {
          needsRepo: true,
          requiredEnv: ["GITHUB_TOKEN", "GITHUB_REPOSITORY"],
        };
      }
      const [owner, name] = repo.split("/");
      const url = `https://api.github.com/repos/${owner}/${name}/secret-scanning/alerts?state=open&per_page=30`;
      const res = await fetchFn(url, {
        headers: {
          Authorization: `Bearer ${values.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(20_000),
      });
      const json = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, repository: repo, result: json };
    },
  });
};

// ── Host vuln SaaS ────────────────────────────────────────────────────────

export const runGreenbone: ModuleAdapter = tenantKeyedGet({
  moduleId: "host.greenbone.auth.v1",
  source: "greenbone-gmp",
  requiredKeys: ["GREENBONE_URL", "GREENBONE_USER", "GREENBONE_PASSWORD"],
  assertScope: true,
  buildRequest: (v) => {
    const token = Buffer.from(`${v.GREENBONE_USER}:${v.GREENBONE_PASSWORD}`).toString(
      "base64",
    );
    const base = v.GREENBONE_URL.replace(/\/$/, "");
    return {
      url: `${base}/gmp?cmd=get_tasks`,
      headers: { Authorization: `Basic ${token}` },
    };
  },
});

export const runQualys: ModuleAdapter = tenantKeyedGet({
  moduleId: "host.qualys.auth.v1",
  source: "qualys-vmdr",
  requiredKeys: ["QUALYS_API_URL", "QUALYS_USERNAME", "QUALYS_PASSWORD"],
  buildRequest: (v) => {
    const token = Buffer.from(`${v.QUALYS_USERNAME}:${v.QUALYS_PASSWORD}`).toString(
      "base64",
    );
    const base = v.QUALYS_API_URL.replace(/\/$/, "");
    return {
      url: `${base}/api/2.0/fo/asset/host/?action=list&truncation_limit=10`,
      headers: {
        Authorization: `Basic ${token}`,
        "X-Requested-With": "Atlas",
      },
    };
  },
});

export const runZapPassive: ModuleAdapter = async (ctx) => {
  const def = mustDef("web.zap.passive.v1");
  assertAllTargetsInScope(ctx);
  return runKeyedAdapter({
    def,
    ctx,
    requiredKeys: ["ZAP_API_URL"],
    anyOfKeys: [["ZAP_API_KEY"]],
    source: "owasp-zap-passive",
    mockEvidence: { mode: "passive-only", activeDisabled: true },
    fetchLive: async ({ values, fetch: fetchFn, ctx: c }) => {
      const base = values.ZAP_API_URL.replace(/\/$/, "");
      const key = values.ZAP_API_KEY;
      // Version check only — never trigger active scan
      const url = `${base}/JSON/core/view/version/?apikey=${encodeURIComponent(key)}`;
      const res = await fetchFn(url, { signal: AbortSignal.timeout(10_000) });
      const json = await res.json().catch(() => null);
      const hosts = apexTargets(c);
      return {
        ok: res.ok,
        status: res.status,
        version: json,
        targetsConsidered: hosts,
        note: "Passive/auth context only — active attack rules not invoked by Atlas.",
      };
    },
  });
};

// ── EDR cloud APIs (not endpoint agents on worker) ────────────────────────

export const runWazuh: ModuleAdapter = tenantKeyedGet({
  moduleId: "edr.wazuh.auth.v1",
  source: "wazuh-api",
  requiredKeys: ["WAZUH_API_URL", "WAZUH_USER", "WAZUH_PASSWORD"],
  buildRequest: (v) => {
    const token = Buffer.from(`${v.WAZUH_USER}:${v.WAZUH_PASSWORD}`).toString("base64");
    const base = v.WAZUH_API_URL.replace(/\/$/, "");
    return {
      url: `${base}/agents?limit=20`,
      headers: { Authorization: `Basic ${token}` },
    };
  },
});

export const runDefenderEndpoint = azureGraphAdapter(
  "edr.defender.auth.v1",
  "defender-endpoint-graph",
  "/security/alerts_v2?$top=25",
);

export const runCrowdStrike: ModuleAdapter = async (ctx) => {
  const def = mustDef("edr.crowdstrike.auth.v1");
  return runKeyedAdapter({
    def,
    ctx,
    requiredKeys: [
      "CROWDSTRIKE_CLIENT_ID",
      "CROWDSTRIKE_CLIENT_SECRET",
    ],
    source: "crowdstrike-falcon",
    assertScope: false,
    mockEvidence: { devices: [] },
    fetchLive: async ({ values, fetch: fetchFn }) => {
      const base =
        (ctx.env?.CROWDSTRIKE_BASE_URL?.trim() ||
          "https://api.crowdstrike.com").replace(/\/$/, "");
      const tokenRes = await fetchFn(`${base}/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: values.CROWDSTRIKE_CLIENT_ID,
          client_secret: values.CROWDSTRIKE_CLIENT_SECRET,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const tokenJson = (await tokenRes.json()) as { access_token?: string };
      if (!tokenRes.ok || !tokenJson.access_token) {
        throw new Error(`CrowdStrike OAuth failed: ${tokenRes.status}`);
      }
      const res = await fetchFn(`${base}/devices/queries/devices/v1?limit=20`, {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const json = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, result: json };
    },
  });
};

export const runElasticDefend: ModuleAdapter = tenantKeyedGet({
  moduleId: "edr.elastic-defend.auth.v1",
  source: "elastic-security",
  requiredKeys: ["ELASTIC_CLOUD_URL", "ELASTIC_API_KEY"],
  assertScope: false,
  buildRequest: (v) => ({
    url: `${v.ELASTIC_CLOUD_URL.replace(/\/$/, "")}/api/endpoint/metadata?pageSize=20`,
    headers: {
      Authorization: `ApiKey ${v.ELASTIC_API_KEY}`,
      "kbn-xsrf": "true",
    },
  }),
});

export const runHuntress: ModuleAdapter = tenantKeyedGet({
  moduleId: "edr.huntress.auth.v1",
  source: "huntress",
  requiredKeys: ["HUNTRESS_API_KEY", "HUNTRESS_API_SECRET"],
  assertScope: false,
  buildRequest: (v) => {
    const token = Buffer.from(
      `${v.HUNTRESS_API_KEY}:${v.HUNTRESS_API_SECRET}`,
    ).toString("base64");
    return {
      url: "https://api.huntress.io/v1/agents?limit=25",
      headers: { Authorization: `Basic ${token}` },
    };
  },
});

export const runEclypsium: ModuleAdapter = tenantKeyedGet({
  moduleId: "firmware.eclypsium.auth.v1",
  source: "eclypsium",
  requiredKeys: ["ECLYPSIUM_API_URL", "ECLYPSIUM_API_KEY"],
  assertScope: false,
  buildRequest: (v) => ({
    url: `${v.ECLYPSIUM_API_URL.replace(/\/$/, "")}/api/v1/devices?limit=25`,
    headers: { Authorization: `Bearer ${v.ECLYPSIUM_API_KEY}` },
  }),
});

// ── Email / DNS SaaS ──────────────────────────────────────────────────────

export const runDefenderO365 = azureGraphAdapter(
  "email.defender-o365.auth.v1",
  "defender-o365",
  "/security/secureScores?$top=5",
);

export const runDmarcian: ModuleAdapter = hostKeyedGet({
  moduleId: "email.dmarcian.auth.v1",
  source: "dmarcian",
  requiredKeys: ["DMARCIAN_API_KEY"],
  buildUrl: (host) =>
    `https://dmarcian.com/api/v1/domain/${encodeURIComponent(host)}`,
  buildHeaders: (v) => ({ Authorization: `Token ${v.DMARCIAN_API_KEY}` }),
});

export const runCloudflareEmail: ModuleAdapter = tenantKeyedGet({
  moduleId: "email.cloudflare-email.auth.v1",
  source: "cloudflare-email-security",
  requiredKeys: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
  assertScope: false,
  buildRequest: (v) => ({
    url: `https://api.cloudflare.com/client/v4/accounts/${v.CLOUDFLARE_ACCOUNT_ID}/email-security/settings`,
    headers: { Authorization: `Bearer ${v.CLOUDFLARE_API_TOKEN}` },
  }),
});

export const runUmbrella: ModuleAdapter = tenantKeyedGet({
  moduleId: "dns.umbrella.auth.v1",
  source: "cisco-umbrella",
  requiredKeys: ["UMBRELLA_API_KEY", "UMBRELLA_KEY_SECRET"],
  assertScope: false,
  buildRequest: (v) => {
    const token = Buffer.from(
      `${v.UMBRELLA_API_KEY}:${v.UMBRELLA_KEY_SECRET}`,
    ).toString("base64");
    return {
      url: "https://api.umbrella.com/deployments/v2/networks",
      headers: { Authorization: `Basic ${token}` },
    };
  },
});

export const runCloudflareGateway: ModuleAdapter = tenantKeyedGet({
  moduleId: "dns.cloudflare-gateway.auth.v1",
  source: "cloudflare-gateway",
  requiredKeys: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
  assertScope: false,
  buildRequest: (v) => ({
    url: `https://api.cloudflare.com/client/v4/accounts/${v.CLOUDFLARE_ACCOUNT_ID}/gateway/rules`,
    headers: { Authorization: `Bearer ${v.CLOUDFLARE_API_TOKEN}` },
  }),
});

export const runDnsFilter: ModuleAdapter = tenantKeyedGet({
  moduleId: "dns.dnsfilter.auth.v1",
  source: "dnsfilter",
  requiredKeys: ["DNSFILTER_API_KEY"],
  assertScope: false,
  buildRequest: (v) => ({
    url: "https://api.dnsfilter.com/v1/networks",
    headers: { Authorization: `Bearer ${v.DNSFILTER_API_KEY}` },
  }),
});

// ── Physical / backup / ZTA / AI / IAM / DLP / TPRM / compliance ─────────

export const runBrivo: ModuleAdapter = async (ctx) => {
  const def = mustDef("physical.brivo.auth.v1");
  return runKeyedAdapter({
    def,
    ctx,
    requiredKeys: ["BRIVO_CLIENT_ID", "BRIVO_CLIENT_SECRET", "BRIVO_API_KEY"],
    source: "brivo",
    assertScope: false,
    mockEvidence: { sites: [] },
    fetchLive: async ({ values, fetch: fetchFn }) => {
      const tokenRes = await fetchFn("https://auth.brivo.com/oauth/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " +
            Buffer.from(
              `${values.BRIVO_CLIENT_ID}:${values.BRIVO_CLIENT_SECRET}`,
            ).toString("base64"),
        },
        body: new URLSearchParams({ grant_type: "client_credentials" }),
        signal: AbortSignal.timeout(15_000),
      });
      const tokenJson = (await tokenRes.json()) as { access_token?: string };
      if (!tokenRes.ok || !tokenJson.access_token) {
        throw new Error(`Brivo OAuth failed: ${tokenRes.status}`);
      }
      const res = await fetchFn("https://api.brivo.com/v1/api/sites", {
        headers: {
          Authorization: `Bearer ${tokenJson.access_token}`,
          "api-key": values.BRIVO_API_KEY,
        },
        signal: AbortSignal.timeout(15_000),
      });
      return {
        ok: res.ok,
        status: res.status,
        result: await res.json().catch(() => null),
      };
    },
  });
};

export const runAwsBackupRestore: ModuleAdapter = async (ctx) => {
  const def = mustDef("backup.aws-restore.auth.v1");
  // Read-only DescribeRestoreTestingPlans via AWS REST is complex without SDK;
  // require keys and return needs_config with note to use prowler-style CLI, OR
  // call STS GetCallerIdentity to prove creds (posture readiness).
  return runKeyedAdapter({
    def,
    ctx,
    requiredKeys: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    source: "aws-backup-restore-readiness",
    assertScope: false,
    mockEvidence: { restorePlans: [], note: "mock — no AWS call" },
    fetchLive: async ({ values }) => {
      // Honest: without AWS SDK we only verify keys present and document next step.
      // Do not invent STS signatures. Return structured readiness evidence.
      return {
        credentialsPresent: true,
        region: ctx.env?.AWS_REGION?.trim() || "eu-west-1",
        accessKeyFingerprint: hashJson(values.AWS_ACCESS_KEY_ID).slice(0, 12),
        note:
          "AWS Backup restore testing requires AWS SDK/CLI (aws backup list-restore-testing-plans). Keys accepted; invoke via cloud.prowler or local AWS CLI job — Atlas does not forge SigV4 here.",
        requiredNext: ["AWS_REGION (optional)", "aws CLI or @aws-sdk/client-backup"],
      };
    },
  });
};

export const runAsrTest = azureGraphAdapter(
  "backup.asr-test.auth.v1",
  "azure-site-recovery",
  // Subscription inventory seed — ASR plans live under resource manager; Graph org proves auth.
  "/organization",
);

export const runRubrik: ModuleAdapter = tenantKeyedGet({
  moduleId: "backup.rubrik.auth.v1",
  source: "rubrik",
  requiredKeys: ["RUBRIK_URL", "RUBRIK_API_TOKEN"],
  assertScope: false,
  buildRequest: (v) => ({
    url: `${v.RUBRIK_URL.replace(/\/$/, "")}/api/v1/cluster/me`,
    headers: { Authorization: `Bearer ${v.RUBRIK_API_TOKEN}` },
  }),
});

/** Gophish — READ campaign list only; never create/send (abuse guard). */
export const runGophish: ModuleAdapter = async (ctx) => {
  const def = mustDef("phish.gophish.auth.v1");
  const lab = envHasAny(ctx.env, ["ATLAS_PHISH_LAB_APPROVED"]);
  if (!lab && !ctx.forceMock && !ctx.syntheticMission) {
    return stubNeedsConfig(def, [
      "GOPHISH_URL",
      "GOPHISH_API_KEY",
      "ATLAS_PHISH_LAB_APPROVED",
    ]);
  }
  return runKeyedAdapter({
    def,
    ctx,
    requiredKeys: ["GOPHISH_URL", "GOPHISH_API_KEY"],
    source: "gophish-read",
    assertScope: false,
    mockEvidence: { campaigns: [], sendDisabled: true },
    fetchLive: async ({ values, fetch: fetchFn }) => {
      const base = values.GOPHISH_URL.replace(/\/$/, "");
      const res = await fetchFn(`${base}/api/campaigns/`, {
        headers: { Authorization: `Bearer ${values.GOPHISH_API_KEY}` },
        signal: AbortSignal.timeout(15_000),
      });
      const json = await res.json().catch(() => null);
      return {
        ok: res.ok,
        status: res.status,
        result: json,
        sendDisabled: true,
        note: "Read-only campaign metrics — Atlas never launches phishing sends.",
      };
    },
  });
};

export const runKnowBe4: ModuleAdapter = async (ctx) => {
  const def = mustDef("phish.knowbe4.auth.v1");
  const lab = envHasAny(ctx.env, ["ATLAS_PHISH_LAB_APPROVED"]);
  if (!lab && !ctx.forceMock && !ctx.syntheticMission) {
    return stubNeedsConfig(def, ["KNOWBE4_API_KEY", "ATLAS_PHISH_LAB_APPROVED"]);
  }
  return runKeyedAdapter({
    def,
    ctx,
    requiredKeys: ["KNOWBE4_API_KEY"],
    source: "knowbe4-pst-read",
    assertScope: false,
    mockEvidence: { campaigns: [], sendDisabled: true },
    fetchLive: async ({ values, fetch: fetchFn }) => {
      const res = await fetchFn(
        "https://us.api.knowbe4.com/v1/phishing/security_tests?per_page=20",
        {
          headers: { Authorization: `Bearer ${values.KNOWBE4_API_KEY}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
      return {
        ok: res.ok,
        status: res.status,
        result: await res.json().catch(() => null),
        sendDisabled: true,
        note: "Metrics read only — no campaign creation from Atlas.",
      };
    },
  });
};

export const runProofpointPhish: ModuleAdapter = async (ctx) => {
  const def = mustDef("phish.proofpoint.auth.v1");
  const lab = envHasAny(ctx.env, ["ATLAS_PHISH_LAB_APPROVED"]);
  if (!lab && !ctx.forceMock && !ctx.syntheticMission) {
    return stubNeedsConfig(def, [
      "PROOFPOINT_API_USER",
      "PROOFPOINT_API_TOKEN",
      "ATLAS_PHISH_LAB_APPROVED",
    ]);
  }
  return runKeyedAdapter({
    def,
    ctx,
    requiredKeys: ["PROOFPOINT_API_USER", "PROOFPOINT_API_TOKEN"],
    source: "proofpoint-awareness-read",
    assertScope: false,
    mockEvidence: { sendDisabled: true },
    fetchLive: async ({ values, fetch: fetchFn }) => {
      const token = Buffer.from(
        `${values.PROOFPOINT_API_USER}:${values.PROOFPOINT_API_TOKEN}`,
      ).toString("base64");
      const res = await fetchFn(
        "https://threatinsight.proofpoint.com/api/v2/campaign/recent",
        {
          headers: { Authorization: `Basic ${token}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
      return {
        ok: res.ok,
        status: res.status,
        result: await res.json().catch(() => null),
        sendDisabled: true,
      };
    },
  });
};

export const runCloudflareAccess: ModuleAdapter = tenantKeyedGet({
  moduleId: "zta.cloudflare-access.auth.v1",
  source: "cloudflare-access",
  requiredKeys: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
  assertScope: false,
  buildRequest: (v) => ({
    url: `https://api.cloudflare.com/client/v4/accounts/${v.CLOUDFLARE_ACCOUNT_ID}/access/apps`,
    headers: { Authorization: `Bearer ${v.CLOUDFLARE_API_TOKEN}` },
  }),
});

export const runZpa: ModuleAdapter = async (ctx) => {
  const def = mustDef("zta.zpa.auth.v1");
  return runKeyedAdapter({
    def,
    ctx,
    requiredKeys: ["ZPA_CLIENT_ID", "ZPA_CLIENT_SECRET", "ZPA_CUSTOMER_ID"],
    source: "zscaler-zpa",
    assertScope: false,
    mockEvidence: { apps: [] },
    fetchLive: async ({ values, fetch: fetchFn }) => {
      const tokenRes = await fetchFn("https://api.private.zscaler.com/signin", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: values.ZPA_CLIENT_ID,
          client_secret: values.ZPA_CLIENT_SECRET,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const tokenJson = (await tokenRes.json()) as { access_token?: string };
      if (!tokenRes.ok || !tokenJson.access_token) {
        throw new Error(`ZPA OAuth failed: ${tokenRes.status}`);
      }
      const res = await fetchFn(
        `https://config.private.zscaler.com/mgmtconfig/v1/admin/customers/${values.ZPA_CUSTOMER_ID}/application`,
        {
          headers: { Authorization: `Bearer ${tokenJson.access_token}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
      return {
        ok: res.ok,
        status: res.status,
        result: await res.json().catch(() => null),
      };
    },
  });
};

export const runTailscale: ModuleAdapter = tenantKeyedGet({
  moduleId: "zta.tailscale.auth.v1",
  source: "tailscale",
  requiredKeys: ["TAILSCALE_API_KEY", "TAILSCALE_TAILNET"],
  assertScope: false,
  buildRequest: (v) => ({
    url: `https://api.tailscale.com/api/v2/tailnet/${encodeURIComponent(v.TAILSCALE_TAILNET)}/devices`,
    headers: { Authorization: `Bearer ${v.TAILSCALE_API_KEY}` },
  }),
});

export const runTeleport: ModuleAdapter = tenantKeyedGet({
  moduleId: "zta.teleport.auth.v1",
  source: "teleport",
  requiredKeys: ["TELEPORT_PROXY", "TELEPORT_IDENTITY_PATH"],
  assertScope: false,
  buildRequest: (v) => ({
    // Identity file path proves config; live tsh requires local binary — return readiness.
    url: `${v.TELEPORT_PROXY.replace(/\/$/, "")}/webapi/ping`,
    headers: {},
  }),
});

export const runAzurePromptShields: ModuleAdapter = async (ctx) => {
  const def = mustDef("ai.azure-prompt-shields.auth.v1");
  return runKeyedAdapter({
    def,
    ctx,
    requiredKeys: ["AZURE_CONTENT_SAFETY_ENDPOINT", "AZURE_CONTENT_SAFETY_KEY"],
    source: "azure-prompt-shields",
    assertScope: false,
    mockEvidence: { attackDetected: false },
    fetchLive: async ({ values, fetch: fetchFn }) => {
      const base = values.AZURE_CONTENT_SAFETY_ENDPOINT.replace(/\/$/, "");
      const res = await fetchFn(
        `${base}/contentsafety/text:shieldPrompt?api-version=2024-09-01`,
        {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": values.AZURE_CONTENT_SAFETY_KEY,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            userPrompt: "Atlas healthcheck — list security policies",
            documents: [],
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      return {
        ok: res.ok,
        status: res.status,
        result: await res.json().catch(() => null),
      };
    },
  });
};

export const runBedrockGuardrails: ModuleAdapter = async (ctx) => {
  const def = mustDef("ai.bedrock-guardrails.auth.v1");
  return runKeyedAdapter({
    def,
    ctx,
    requiredKeys: [
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "BEDROCK_GUARDRAIL_ID",
    ],
    source: "bedrock-guardrails",
    assertScope: false,
    mockEvidence: { guardrailId: "mock" },
    fetchLive: async ({ values }) => ({
      credentialsPresent: true,
      guardrailId: values.BEDROCK_GUARDRAIL_ID,
      accessKeyFingerprint: hashJson(values.AWS_ACCESS_KEY_ID).slice(0, 12),
      note:
        "Bedrock Guardrails ApplyGuardrail needs AWS SigV4 SDK — keys + guardrail id accepted; invoke via AWS CLI/SDK job.",
    }),
  });
};

export const runLakera: ModuleAdapter = async (ctx) => {
  const def = mustDef("ai.lakera.auth.v1");
  return runKeyedAdapter({
    def,
    ctx,
    requiredKeys: ["LAKERA_API_KEY"],
    source: "lakera-guard",
    assertScope: false,
    mockEvidence: { flagged: false },
    fetchLive: async ({ values, fetch: fetchFn }) => {
      const res = await fetchFn("https://api.lakera.ai/v2/guard", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${values.LAKERA_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Atlas healthcheck" }],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      return {
        ok: res.ok,
        status: res.status,
        result: await res.json().catch(() => null),
      };
    },
  });
};

export const runEntraId = azureGraphAdapter(
  "iam.entra.auth.v1",
  "entra-id",
  "/identity/conditionalAccess/policies?$top=20",
);

export const runOkta: ModuleAdapter = tenantKeyedGet({
  moduleId: "iam.okta.auth.v1",
  source: "okta",
  requiredKeys: ["OKTA_DOMAIN", "OKTA_API_TOKEN"],
  assertScope: false,
  buildRequest: (v) => {
    const domain = v.OKTA_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return {
      url: `https://${domain}/api/v1/policies?type=OKTA_SIGN_ON`,
      headers: {
        Authorization: `SSWS ${v.OKTA_API_TOKEN}`,
        Accept: "application/json",
      },
    };
  },
});

export const runSailpoint: ModuleAdapter = async (ctx) => {
  const def = mustDef("iam.sailpoint.auth.v1");
  return runKeyedAdapter({
    def,
    ctx,
    requiredKeys: [
      "SAILPOINT_URL",
      "SAILPOINT_CLIENT_ID",
      "SAILPOINT_CLIENT_SECRET",
    ],
    source: "sailpoint-isc",
    assertScope: false,
    mockEvidence: { identities: [] },
    fetchLive: async ({ values, fetch: fetchFn }) => {
      const base = values.SAILPOINT_URL.replace(/\/$/, "");
      const tokenRes = await fetchFn(`${base}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: values.SAILPOINT_CLIENT_ID,
          client_secret: values.SAILPOINT_CLIENT_SECRET,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const tokenJson = (await tokenRes.json()) as { access_token?: string };
      if (!tokenRes.ok || !tokenJson.access_token) {
        throw new Error(`SailPoint OAuth failed: ${tokenRes.status}`);
      }
      const res = await fetchFn(`${base}/v3/public-identities?limit=20`, {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      return {
        ok: res.ok,
        status: res.status,
        result: await res.json().catch(() => null),
      };
    },
  });
};

export const runCyberark: ModuleAdapter = tenantKeyedGet({
  moduleId: "iam.cyberark.auth.v1",
  source: "cyberark-pam",
  requiredKeys: ["CYBERARK_URL", "CYBERARK_USERNAME", "CYBERARK_PASSWORD"],
  assertScope: false,
  buildRequest: (v) => {
    const base = v.CYBERARK_URL.replace(/\/$/, "");
    return {
      url: `${base}/PasswordVault/API/Accounts?limit=10`,
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${v.CYBERARK_USERNAME}:${v.CYBERARK_PASSWORD}`).toString(
            "base64",
          ),
      },
    };
  },
});

export const runPurview = azureGraphAdapter(
  "dlp.purview.auth.v1",
  "purview-dlp",
  "/security/informationProtection/policyLabels?$top=25",
);

export const runNightfall: ModuleAdapter = tenantKeyedGet({
  moduleId: "dlp.nightfall.auth.v1",
  source: "nightfall",
  requiredKeys: ["NIGHTFALL_API_KEY"],
  assertScope: false,
  buildRequest: (v) => ({
    url: "https://api.nightfall.ai/v3/policies",
    headers: { Authorization: `Bearer ${v.NIGHTFALL_API_KEY}` },
  }),
});

export const runGoogleSdp: ModuleAdapter = async (ctx) => {
  const def = mustDef("dlp.google-sdp.auth.v1");
  const creds = envHasAny(ctx.env, ["GOOGLE_APPLICATION_CREDENTIALS"]);
  const project = envHasAny(ctx.env, ["GOOGLE_CLOUD_PROJECT", "GCP_PROJECT"]);
  if (ctx.forceMock || ctx.syntheticMission) {
    return baseResult(def, {
      status: "ok",
      evidence: { source: "google-sdp", mocked: true },
    });
  }
  if (!creds || !project) {
    return stubNeedsConfig(def, [
      "GOOGLE_APPLICATION_CREDENTIALS",
      "GOOGLE_CLOUD_PROJECT",
    ]);
  }
  // ADC file present — readiness only without google-auth SDK signing
  return baseResult(def, {
    status: "ok",
    evidence: {
      source: "google-sdp",
      credentialsPathSet: true,
      project,
      note: "GCP DLP inspect needs google-auth ADC token — path accepted; call via gcloud/DLP API job.",
    },
  });
};

export const runSonarQube: ModuleAdapter = tenantKeyedGet({
  moduleId: "sast.sonarqube.auth.v1",
  source: "sonarqube",
  requiredKeys: ["SONAR_HOST_URL", "SONAR_TOKEN"],
  assertScope: false,
  buildRequest: (v) => ({
    url: `${v.SONAR_HOST_URL.replace(/\/$/, "")}/api/issues/search?resolved=false&ps=20`,
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${v.SONAR_TOKEN}:`).toString("base64"),
    },
  }),
});

export const runSecurityScorecard: ModuleAdapter = hostKeyedGet({
  moduleId: "tprm.securityscorecard.passive.v1",
  source: "securityscorecard",
  requiredKeys: ["SECURITYSCORECARD_API_KEY"],
  buildUrl: (host) =>
    `https://api.securityscorecard.io/companies/${encodeURIComponent(host)}`,
  buildHeaders: (v) => ({ Authorization: `Token ${v.SECURITYSCORECARD_API_KEY}` }),
});

export const runBitSight: ModuleAdapter = hostKeyedGet({
  moduleId: "tprm.bitsight.passive.v1",
  source: "bitsight",
  requiredKeys: ["BITSIGHT_API_KEY"],
  buildUrl: (host) =>
    `https://api.bitsighttech.com/ratings/v1/companies?domain=${encodeURIComponent(host)}`,
  buildHeaders: (v) => ({
    Authorization:
      "Basic " + Buffer.from(`${v.BITSIGHT_API_KEY}:`).toString("base64"),
  }),
});

export const runUpGuard: ModuleAdapter = hostKeyedGet({
  moduleId: "tprm.upguard.passive.v1",
  source: "upguard",
  requiredKeys: ["UPGUARD_API_KEY"],
  buildUrl: (host) =>
    `https://cyber-risk.upguard.com/api/public/vendors?hostname=${encodeURIComponent(host)}`,
  buildHeaders: (v) => ({ Authorization: v.UPGUARD_API_KEY }),
});

export const runPanorays: ModuleAdapter = hostKeyedGet({
  moduleId: "tprm.panorays.auth.v1",
  source: "panorays",
  requiredKeys: ["PANORAYS_API_KEY"],
  buildUrl: (host) =>
    `https://api.panorays.com/v1/suppliers?domain=${encodeURIComponent(host)}`,
  buildHeaders: (v) => ({ Authorization: `Bearer ${v.PANORAYS_API_KEY}` }),
});

export const runVanta: ModuleAdapter = tenantKeyedGet({
  moduleId: "compliance.vanta.auth.v1",
  source: "vanta",
  requiredKeys: ["VANTA_API_KEY"],
  assertScope: false,
  buildRequest: (v) => ({
    url: "https://api.vanta.com/v1/controls",
    headers: { Authorization: `Bearer ${v.VANTA_API_KEY}` },
  }),
});

export const runDrata: ModuleAdapter = tenantKeyedGet({
  moduleId: "compliance.drata.auth.v1",
  source: "drata",
  requiredKeys: ["DRATA_API_KEY"],
  assertScope: false,
  buildRequest: (v) => ({
    url: "https://public-api.drata.com/public/v2/controls",
    headers: { Authorization: `Bearer ${v.DRATA_API_KEY}` },
  }),
});

export const AUTH_API_ADAPTERS: Record<string, ModuleAdapter> = {
  "asm.censys.passive.v1": runCensys,
  "asm.shodan.passive.v1": runShodan,
  "asm.securitytrails.passive.v1": runSecurityTrails,
  "asm.defender-easm.auth.v1": runDefenderEasm,
  "asm.cisa-cyhy.enrolled.v1": runCisaCyhy,
  "asm.shadowserver.enrolled.v1": runShadowserver,
  "breach.spycloud.auth.v1": runSpyCloud,
  "breach.entra-id-protection.auth.v1": runEntraIdProtection,
  "sca.dependabot.auth.v1": runDependabot,
  "secrets.github-scanning.auth.v1": runGithubSecretScanning,
  "host.greenbone.auth.v1": runGreenbone,
  "host.qualys.auth.v1": runQualys,
  "web.zap.passive.v1": runZapPassive,
  "edr.wazuh.auth.v1": runWazuh,
  "edr.defender.auth.v1": runDefenderEndpoint,
  "edr.crowdstrike.auth.v1": runCrowdStrike,
  "edr.elastic-defend.auth.v1": runElasticDefend,
  "edr.huntress.auth.v1": runHuntress,
  "firmware.eclypsium.auth.v1": runEclypsium,
  "email.defender-o365.auth.v1": runDefenderO365,
  "email.dmarcian.auth.v1": runDmarcian,
  "email.cloudflare-email.auth.v1": runCloudflareEmail,
  "dns.umbrella.auth.v1": runUmbrella,
  "dns.cloudflare-gateway.auth.v1": runCloudflareGateway,
  "dns.dnsfilter.auth.v1": runDnsFilter,
  "physical.brivo.auth.v1": runBrivo,
  "backup.aws-restore.auth.v1": runAwsBackupRestore,
  "backup.asr-test.auth.v1": runAsrTest,
  "backup.rubrik.auth.v1": runRubrik,
  "phish.gophish.auth.v1": runGophish,
  "phish.knowbe4.auth.v1": runKnowBe4,
  "phish.proofpoint.auth.v1": runProofpointPhish,
  "zta.cloudflare-access.auth.v1": runCloudflareAccess,
  "zta.zpa.auth.v1": runZpa,
  "zta.tailscale.auth.v1": runTailscale,
  "zta.teleport.auth.v1": runTeleport,
  "ai.azure-prompt-shields.auth.v1": runAzurePromptShields,
  "ai.bedrock-guardrails.auth.v1": runBedrockGuardrails,
  "ai.lakera.auth.v1": runLakera,
  "iam.entra.auth.v1": runEntraId,
  "iam.okta.auth.v1": runOkta,
  "iam.sailpoint.auth.v1": runSailpoint,
  "iam.cyberark.auth.v1": runCyberark,
  "dlp.purview.auth.v1": runPurview,
  "dlp.nightfall.auth.v1": runNightfall,
  "dlp.google-sdp.auth.v1": runGoogleSdp,
  "sast.sonarqube.auth.v1": runSonarQube,
  "tprm.securityscorecard.passive.v1": runSecurityScorecard,
  "tprm.bitsight.passive.v1": runBitSight,
  "tprm.upguard.passive.v1": runUpGuard,
  "tprm.panorays.auth.v1": runPanorays,
  "compliance.vanta.auth.v1": runVanta,
  "compliance.drata.auth.v1": runDrata,
};
