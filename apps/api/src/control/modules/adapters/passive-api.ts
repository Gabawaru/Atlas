/**
 * Wired passive-API adapters (ASM / web hygiene / mail DNS / TI / breach).
 * All calls are in-scope only; forceMock short-circuits to synthetic evidence.
 */
import { resolveMx, resolveTxt } from "node:dns/promises";
import { getModuleDefinition } from "../registry";
import type { ModuleAdapter, ModuleRunContext } from "../types";
import {
  apexTargets,
  assertAllTargetsInScope,
  baseResult,
  ctxFetch,
  envHasAny,
  hashJson,
  sleepRate,
  stubNeedsConfig,
} from "../helpers";

function mustDef(id: string) {
  const d = getModuleDefinition(id);
  if (!d) throw new Error(`module def missing: ${id}`);
  return d;
}

async function mockOrFetchJson(
  ctx: ModuleRunContext,
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; json: unknown; mocked: boolean }> {
  if (ctx.forceMock || ctx.syntheticMission) {
    return {
      ok: true,
      status: 200,
      mocked: true,
      json: { mock: true, url, synthetic: true },
    };
  }
  const res = await ctxFetch(ctx)(url, {
    ...init,
    signal: AbortSignal.timeout(12_000),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, mocked: false };
}

/** crt.sh Certificate Transparency */
export const runCrtsh: ModuleAdapter = async (ctx) => {
  const def = mustDef("asm.crtsh.passive.v1");
  assertAllTargetsInScope(ctx);
  const hosts = apexTargets(ctx);
  const rows: unknown[] = [];
  for (const host of hosts) {
    if (ctx.isCancelled()) break;
    if (ctx.forceMock || ctx.syntheticMission) {
      rows.push({
        host,
        mocked: true,
        certs: [
          {
            id: 1,
            common_name: host,
            name_value: `www.${host}\n${host}`,
            issuer_name: "Atlas Mock CA",
          },
        ],
      });
    } else {
      const q = `%.${host}`;
      const url = `https://crt.sh/?q=${encodeURIComponent(q)}&output=json`;
      const res = await mockOrFetchJson(ctx, url, {
        headers: { Accept: "application/json" },
      });
      const list = Array.isArray(res.json) ? res.json.slice(0, 50) : [];
      rows.push({
        host,
        ok: res.ok,
        status: res.status,
        count: list.length,
        sample: list.slice(0, 10),
      });
    }
    await sleepRate(ctx, def.rateLimitPerMinuteDefault);
  }
  const evidence = { source: "crt.sh", rows, evidenceHash: hashJson(rows) };
  return baseResult(def, {
    status: "ok",
    evidence,
    findings: [
      {
        severity: "info",
        title: "Inventaire Certificate Transparency",
        summary: `crt.sh: ${rows.length} hôte(s) apex interrogé(s) (passif).`,
      },
    ],
  });
};

/** urlscan.io search (owned URLs) — submit disabled without key + explicit flag */
export const runUrlscan: ModuleAdapter = async (ctx) => {
  const def = mustDef("asm.urlscan.passive.v1");
  assertAllTargetsInScope(ctx);
  const key = envHasAny(ctx.env, ["URLSCAN_API_KEY"]);
  const hosts = apexTargets(ctx);
  const rows: unknown[] = [];
  for (const host of hosts) {
    if (ctx.isCancelled()) break;
    if (ctx.forceMock || ctx.syntheticMission) {
      rows.push({
        host,
        mocked: true,
        results: [{ page: { domain: host, url: `https://${host}/` } }],
      });
    } else {
      const url = `https://urlscan.io/api/v1/search/?q=${encodeURIComponent(`domain:${host}`)}&size=10`;
      const headers: Record<string, string> = { Accept: "application/json" };
      if (key) headers["API-Key"] = key;
      const res = await mockOrFetchJson(ctx, url, { headers });
      rows.push({
        host,
        ok: res.ok,
        status: res.status,
        result: res.json,
        authenticated: Boolean(key),
      });
    }
    await sleepRate(ctx, def.rateLimitPerMinuteDefault);
  }
  return baseResult(def, {
    status: "ok",
    evidence: { source: "urlscan.io", rows, evidenceHash: hashJson(rows) },
    findings: [
      {
        severity: "info",
        title: "urlscan.io search",
        summary: `Recherche historique in-scope pour ${hosts.length} domaine(s).`,
      },
    ],
  });
};

/** Mozilla HTTP Observatory (v2 API) */
export const runObservatory: ModuleAdapter = async (ctx) => {
  const def = mustDef("web.observatory.passive.v1");
  assertAllTargetsInScope(ctx);
  const hosts = apexTargets(ctx);
  const rows: unknown[] = [];
  for (const host of hosts) {
    if (ctx.isCancelled()) break;
    if (ctx.forceMock || ctx.syntheticMission) {
      rows.push({
        host,
        mocked: true,
        grade: "B",
        score: 75,
        tests: { "content-security-policy": { pass: false } },
      });
    } else {
      // Observatory analyze — host only, GET history / analyze endpoints
      const analyzeUrl = `https://observatory-api.mdn.mozilla.net/api/v2/analyze?host=${encodeURIComponent(host)}`;
      const res = await mockOrFetchJson(ctx, analyzeUrl, { method: "GET" });
      rows.push({ host, ok: res.ok, status: res.status, result: res.json });
    }
    await sleepRate(ctx, def.rateLimitPerMinuteDefault);
  }
  return baseResult(def, {
    status: "ok",
    evidence: { source: "mozilla-observatory", rows, evidenceHash: hashJson(rows) },
    findings: [
      {
        severity: "info",
        title: "Mozilla HTTP Observatory",
        summary: `Hygiène headers/TLS évaluée pour ${hosts.length} hôte(s).`,
      },
    ],
  });
};

/** SecurityHeaders.com */
export const runSecurityHeaders: ModuleAdapter = async (ctx) => {
  const def = mustDef("web.securityheaders.passive.v1");
  assertAllTargetsInScope(ctx);
  const hosts = apexTargets(ctx);
  const rows: unknown[] = [];
  for (const host of hosts) {
    if (ctx.isCancelled()) break;
    if (ctx.forceMock || ctx.syntheticMission) {
      rows.push({ host, mocked: true, grade: "C", missing: ["Content-Security-Policy"] });
    } else {
      const target = `https://${host}/`;
      const url = `https://securityheaders.com/?q=${encodeURIComponent(target)}&followRedirects=on`;
      const res = await ctxFetch(ctx)(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: "text/html" },
      });
      const grade = res.headers.get("x-grade") ?? undefined;
      rows.push({
        host,
        ok: res.ok,
        status: res.status,
        grade,
        // Body not scraped into report — header grade only (passive, light)
      });
    }
    await sleepRate(ctx, 10);
  }
  return baseResult(def, {
    status: "ok",
    evidence: { source: "securityheaders.com", rows, evidenceHash: hashJson(rows) },
  });
};

/** SSL Labs — cached/analyze; heavy rate limit; mock by default in CI */
export const runSslLabs: ModuleAdapter = async (ctx) => {
  const def = mustDef("web.ssllabs.passive.v1");
  assertAllTargetsInScope(ctx);
  const hosts = apexTargets(ctx);
  const rows: unknown[] = [];
  for (const host of hosts) {
    if (ctx.isCancelled()) break;
    if (ctx.forceMock || ctx.syntheticMission) {
      rows.push({
        host,
        mocked: true,
        status: "READY",
        endpoints: [{ grade: "A", ipAddress: "203.0.113.10" }],
      });
    } else {
      const url =
        `https://api.ssllabs.com/api/v3/analyze?host=${encodeURIComponent(host)}` +
        `&publish=off&fromCache=on&maxAge=24&all=done`;
      const res = await mockOrFetchJson(ctx, url);
      rows.push({ host, ok: res.ok, status: res.status, result: res.json });
    }
    await sleepRate(ctx, def.rateLimitPerMinuteDefault ?? 2);
  }
  return baseResult(def, {
    status: "ok",
    evidence: { source: "ssllabs", rows, evidenceHash: hashJson(rows) },
  });
};

/** Mail auth via DNS (MX Toolbox–class, no paid scrape) */
export const runMailAuthDns: ModuleAdapter = async (ctx) => {
  const def = mustDef("email.mail-auth.dns.passive.v1");
  assertAllTargetsInScope(ctx);
  const hosts = apexTargets(ctx);
  const rows: unknown[] = [];
  for (const host of hosts) {
    if (ctx.isCancelled()) break;
    if (ctx.forceMock || ctx.syntheticMission) {
      rows.push({
        host,
        mocked: true,
        mx: ["mail.synthetic.invalid"],
        spf: ["v=spf1 -all"],
        dmarc: ["v=DMARC1; p=reject"],
      });
    } else {
      const [mx, txt, dmarc] = await Promise.all([
        resolveMx(host).catch(() => []),
        resolveTxt(host).catch(() => []),
        resolveTxt(`_dmarc.${host}`).catch(() => []),
      ]);
      const flatTxt = txt.map((r) => r.join(""));
      const flatDmarc = dmarc.map((r) => r.join(""));
      rows.push({
        host,
        mx: mx.map((m) => ({ exchange: m.exchange, priority: m.priority })),
        spf: flatTxt.filter((t) => /v=spf1/i.test(t)),
        dmarc: flatDmarc.filter((t) => /v=DMARC1/i.test(t)),
        txtSample: flatTxt.slice(0, 5),
      });
    }
    await sleepRate(ctx, 30);
  }
  const missingDmarc = rows.filter((r) => {
    const row = r as { dmarc?: string[] };
    return !row.dmarc?.length;
  }).length;
  return baseResult(def, {
    status: "ok",
    evidence: { source: "dns.mail-auth", rows, evidenceHash: hashJson(rows) },
    findings:
      missingDmarc > 0
        ? [
            {
              severity: "low",
              title: "DMARC absent ou non résolu",
              summary: `${missingDmarc} domaine(s) sans enregistrement DMARC observable.`,
            },
          ]
        : [
            {
              severity: "info",
              title: "Authentification mail DNS",
              summary: "SPF/DMARC/MX observés passivement.",
            },
          ],
  });
};

/** AlienVault OTX passive indicator lookup */
export const runOtx: ModuleAdapter = async (ctx) => {
  const def = mustDef("ti.otx.passive.v1");
  assertAllTargetsInScope(ctx);
  const key = envHasAny(ctx.env, ["OTX_API_KEY"]);
  const hosts = apexTargets(ctx);
  const rows: unknown[] = [];
  for (const host of hosts) {
    if (ctx.isCancelled()) break;
    if (ctx.forceMock || ctx.syntheticMission) {
      rows.push({ host, mocked: true, pulse_info: { count: 0 } });
    } else {
      const url = `https://otx.alienvault.com/api/v1/indicators/domain/${encodeURIComponent(host)}/general`;
      const headers: Record<string, string> = { Accept: "application/json" };
      if (key) headers["X-OTX-API-KEY"] = key;
      const res = await mockOrFetchJson(ctx, url, { headers });
      rows.push({
        host,
        ok: res.ok,
        status: res.status,
        result: res.json,
        authenticated: Boolean(key),
      });
    }
    await sleepRate(ctx, 20);
  }
  return baseResult(def, {
    status: "ok",
    evidence: {
      source: "otx",
      rows,
      evidenceHash: hashJson(rows),
      usage: "defensive enrichment only — not attack recon",
    },
  });
};

/** VirusTotal domain report */
export const runVirusTotal: ModuleAdapter = async (ctx) => {
  const def = mustDef("ti.virustotal.passive.v1");
  assertAllTargetsInScope(ctx);
  const key = envHasAny(ctx.env, ["VT_API_KEY", "VIRUSTOTAL_API_KEY"]);
  if (!key && !ctx.forceMock && !ctx.syntheticMission) {
    return stubNeedsConfig(def, ["VT_API_KEY"]);
  }
  const hosts = apexTargets(ctx);
  const rows: unknown[] = [];
  for (const host of hosts) {
    if (ctx.isCancelled()) break;
    if (ctx.forceMock || ctx.syntheticMission || !key) {
      rows.push({
        host,
        mocked: true,
        data: { attributes: { last_analysis_stats: { malicious: 0, harmless: 10 } } },
      });
    } else {
      const url = `https://www.virustotal.com/api/v3/domains/${encodeURIComponent(host)}`;
      const res = await mockOrFetchJson(ctx, url, {
        headers: { "x-apikey": key, Accept: "application/json" },
      });
      rows.push({ host, ok: res.ok, status: res.status, result: res.json });
    }
    await sleepRate(ctx, 4);
  }
  return baseResult(def, {
    status: "ok",
    evidence: { source: "virustotal", rows, evidenceHash: hashJson(rows) },
  });
};

/** HIBP domain breach search (requires API key) */
export const runHibp: ModuleAdapter = async (ctx) => {
  const def = mustDef("breach.hibp.passive.v1");
  assertAllTargetsInScope(ctx);
  const key = envHasAny(ctx.env, ["HIBP_API_KEY"]);
  if (!key && !ctx.forceMock && !ctx.syntheticMission) {
    return stubNeedsConfig(def, ["HIBP_API_KEY"]);
  }
  const hosts = apexTargets(ctx);
  const rows: unknown[] = [];
  for (const host of hosts) {
    if (ctx.isCancelled()) break;
    if (ctx.forceMock || ctx.syntheticMission || !key) {
      rows.push({ host, mocked: true, breaches: [] });
    } else {
      const url = `https://haveibeenpwned.com/api/v3/breaches?domain=${encodeURIComponent(host)}`;
      const res = await mockOrFetchJson(ctx, url, {
        headers: {
          "hibp-api-key": key,
          "user-agent": "Atlas-Passive-Module",
          Accept: "application/json",
        },
      });
      rows.push({ host, ok: res.ok, status: res.status, result: res.json });
    }
    await sleepRate(ctx, 6);
  }
  return baseResult(def, {
    status: "ok",
    evidence: { source: "hibp", rows, evidenceHash: hashJson(rows) },
    findings: [
      {
        severity: "info",
        title: "Have I Been Pwned (domaine)",
        summary: `Recherche breaches pour ${hosts.length} domaine(s) in-scope.`,
      },
    ],
  });
};

/** OSV query API for package names inferred from presence banners (cooperative) */
export const runOsvApi: ModuleAdapter = async (ctx) => {
  const def = mustDef("sca.osv.local.v1");
  const packages: { name: string; ecosystem: string }[] = [];
  // Cooperate with presence evidence banners when available
  const presence = ctx.presenceEvidence;
  if (Array.isArray(presence)) {
    for (const row of presence as { http?: { server?: string } }[]) {
      const server = row.http?.server;
      if (!server) continue;
      const m = server.match(/^([A-Za-z0-9._-]+)\/?([0-9.]+)?/);
      if (m?.[1]) {
        packages.push({ name: m[1].toLowerCase(), ecosystem: "OSS-Fuzz" });
      }
    }
  }
  if (ctx.forceMock || ctx.syntheticMission) {
    return baseResult(def, {
      status: "ok",
      evidence: {
        source: "osv.dev",
        mocked: true,
        packages,
        vulns: [],
        note: "Mock — pas d'appel OSV",
      },
    });
  }
  if (packages.length === 0 && !ctx.localPath) {
    // Try CLI if local path set; else informational skip
    return baseResult(def, {
      status: "skipped",
      evidence: {
        source: "osv.dev",
        reason: "Aucun paquet inféré ni localPath — module prêt pour coopération",
      },
    });
  }
  const vulns: unknown[] = [];
  for (const pkg of packages.slice(0, 5)) {
    if (ctx.isCancelled()) break;
    const res = await mockOrFetchJson(ctx, "https://api.osv.dev/v1/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ package: { name: pkg.name, ecosystem: pkg.ecosystem } }),
    });
    vulns.push({ package: pkg, ok: res.ok, result: res.json });
    await sleepRate(ctx, 30);
  }
  return baseResult(def, {
    status: "ok",
    evidence: { source: "osv.dev", packages, vulns, evidenceHash: hashJson(vulns) },
  });
};

export const PASSIVE_API_ADAPTERS: Record<string, ModuleAdapter> = {
  "asm.crtsh.passive.v1": runCrtsh,
  "asm.urlscan.passive.v1": runUrlscan,
  "web.observatory.passive.v1": runObservatory,
  "web.securityheaders.passive.v1": runSecurityHeaders,
  "web.ssllabs.passive.v1": runSslLabs,
  "email.mail-auth.dns.passive.v1": runMailAuthDns,
  "ti.otx.passive.v1": runOtx,
  "ti.virustotal.passive.v1": runVirusTotal,
  "breach.hibp.passive.v1": runHibp,
  "sca.osv.local.v1": runOsvApi,
};
