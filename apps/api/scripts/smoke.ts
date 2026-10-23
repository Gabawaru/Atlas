/**
 * Smoke e2e : Postgres + Redis requis (docker compose up -d).
 * Quitte 0 si OK, 77 si infra absente, 1 si échec logique.
 */
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import IORedis from "ioredis";

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://atlas:atlas_dev_only@localhost:5432/atlas?schema=public&options=-c%20app.bypass_rls%3Don";
const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const API_PORT = Number(process.env.API_PORT ?? 3001);
const BASE = `http://127.0.0.1:${API_PORT}/v1`;

async function canReachPostgres(): Promise<boolean> {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient({
      datasources: { db: { url: DATABASE_URL } },
    });
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$disconnect();
    return true;
  } catch {
    return false;
  }
}

async function canReachRedis(): Promise<boolean> {
  try {
    const r = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
      lazyConnect: true,
    });
    await r.connect();
    const pong = await r.ping();
    await r.quit();
    return pong === "PONG";
  } catch {
    return false;
  }
}

async function main() {
  process.env.DATABASE_URL = DATABASE_URL;
  process.env.REDIS_URL = REDIS_URL;
  process.env.JWT_SECRET =
    process.env.JWT_SECRET ?? "dev-only-change-me-not-a-real-secret";
  // Smoke utilise des preuves réseau réelles sur example.com sauf forçage mock
  if (process.env.ATLAS_FORCE_MOCK_NETWORK === undefined) {
    process.env.ATLAS_FORCE_MOCK_NETWORK = "false";
  }

  if (!(await canReachPostgres())) {
    console.warn(
      "SKIP smoke: Postgres injoignable. Lancez `docker compose up -d` puis migrate/seed.",
    );
    process.exit(77);
  }
  if (!(await canReachRedis())) {
    console.warn(
      "SKIP smoke: Redis injoignable (BullMQ). Lancez `docker compose up -d`.",
    );
    process.exit(77);
  }

  execSync("pnpm exec prisma migrate deploy", {
    cwd: API_ROOT,
    stdio: "inherit",
    env: process.env,
  });
  execSync("pnpm exec tsx prisma/seed.ts", {
    cwd: API_ROOT,
    stdio: "inherit",
    env: process.env,
  });

  const child = spawn("pnpm", ["exec", "tsx", "src/main.ts"], {
    cwd: API_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let ready = false;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const h = await fetch(`${BASE}/health`);
      if (h.ok) {
        ready = true;
        break;
      }
    } catch {
      /* retry */
    }
  }
  if (!ready) {
    child.kill();
    console.error("API non démarrée");
    process.exit(1);
  }

  try {
    const login = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@demo.atlas.local",
        password: "atlas-demo",
      }),
    }).then((r) => r.json());
    if (!login.accessToken) throw new Error("login failed");

    const headers = {
      Authorization: `Bearer ${login.accessToken}`,
      "Content-Type": "application/json",
    };

    const assets = await fetch(`${BASE}/assets`, { headers }).then((r) =>
      r.json(),
    );
    if (!Array.isArray(assets) || assets.length < 1) {
      throw new Error("assets seed manquants");
    }

    // Connecteur présence web (idempotent si seed déjà actif)
    await fetch(`${BASE}/connectors/connect`, {
      method: "POST",
      headers,
      body: JSON.stringify({ connectorId: "web.passive.presence" }),
    });

    const mission = await fetch(`${BASE}/missions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "[FICTIF] Smoke présence web",
        uxNeedIds: ["web_presence"],
        assetIds: [assets[0].id],
        synthetic: true,
      }),
    }).then((r) => r.json());

    const afterAuth = await fetch(
      `${BASE}/missions/${mission.id}/owner-authorization`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ signerLabel: "Camille Client (FICTIF)" }),
      },
    ).then((r) => r.json());

    if (afterAuth.status !== "A_SKIPPED_DEMO") {
      throw new Error(`attendu A_SKIPPED_DEMO, reçu ${afterAuth.status}`);
    }
    const ownerAuth = afterAuth.ownerAuths?.[0];
    if (!ownerAuth?.signatureProvider) {
      throw new Error("SignatureProvider mock non branché");
    }

    const run = await fetch(`${BASE}/missions/${mission.id}/execute`, {
      method: "POST",
      headers,
    }).then((r) => r.json());

    if (run.gate?.decision !== "ALLOW") {
      throw new Error(`gate reject: ${JSON.stringify(run.gate)}`);
    }
    if (run.mission?.status !== "REPORT_AVAILABLE") {
      throw new Error(`status final ${run.mission?.status}`);
    }

    const job = run.mission.jobRuns?.[0];
    if (!job?.bullJobId) throw new Error("bullJobId manquant");
    if (job.progressPercent !== 100) {
      throw new Error(`progress attendu 100, reçu ${job.progressPercent}`);
    }

    const report = run.mission.reports?.[0];
    if (!report?.id) throw new Error("rapport manquant");
    if (!report.exportCsv) throw new Error("export CSV manquant");
    if (!report.exportPdfPath) throw new Error("export PDF path manquant");

    for (const format of ["json", "csv", "pdf"] as const) {
      const res = await fetch(
        `${BASE}/missions/${mission.id}/reports/${report.id}/export?format=${format}`,
        { headers },
      );
      if (!res.ok) throw new Error(`export ${format} HTTP ${res.status}`);
      if (res.headers.get("x-atlas-synthetic") !== "true") {
        throw new Error(`export ${format} sans marqueur synthétique`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 10) throw new Error(`export ${format} vide`);
      if (format === "pdf" && buf.subarray(0, 4).toString() !== "%PDF") {
        throw new Error("PDF invalide");
      }
    }

    // Preuve DNS réelle attendue sur example.com (sauf mock forcé)
    const evidence = job.evidenceJson as
      | Array<{ host: string; dns?: { resolved?: boolean }; networkMocked?: boolean }>
      | null;
    if (process.env.ATLAS_FORCE_MOCK_NETWORK !== "true") {
      const first = evidence?.[0];
      if (!first?.dns?.resolved) {
        throw new Error("preuve DNS réelle attendue sur example.com");
      }
      if (first.networkMocked) {
        throw new Error("networkMocked inattendu sans ATLAS_FORCE_MOCK_NETWORK");
      }
    }

    // Findings → remédiation client
    const findings = await fetch(`${BASE}/findings`, { headers }).then((r) =>
      r.json(),
    );
    if (!Array.isArray(findings) || findings.length < 1) {
      throw new Error("findings attendus (seed ou mission smoke)");
    }
    const rem = await fetch(
      `${BASE}/findings/${findings[0].id}/remediation`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          remediationStatus: "in_progress",
          remediationNote: "[FICTIF] smoke remédiation",
        }),
      },
    ).then((r) => r.json());
    if (rem.remediationStatus !== "in_progress") {
      throw new Error(`remédiation attendue in_progress, reçu ${rem.remediationStatus}`);
    }

    // SAV : support peut créer ; approver ne peut pas muter
    const supportLogin = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "support@a.atlas.local",
        password: "atlas-demo",
      }),
    }).then((r) => r.json());
    const supportHeaders = {
      Authorization: `Bearer ${supportLogin.accessToken}`,
      "Content-Type": "application/json",
    };
    const tenants = await fetch(`${BASE}/admin/tenants`, {
      headers: supportHeaders,
    }).then((r) => r.json());
    const demoTenant = Array.isArray(tenants)
      ? tenants.find((t: { slug: string }) => t.slug === "demo-synth") ??
        tenants[0]
      : null;
    if (!demoTenant?.id) {
      throw new Error(
        `tenant démo introuvable pour SAV: ${JSON.stringify(tenants)}`,
      );
    }
    const ticket = await fetch(`${BASE}/admin/tickets`, {
      method: "POST",
      headers: supportHeaders,
      body: JSON.stringify({
        tenantId: demoTenant.id,
        subject: "[FICTIF] Smoke SAV",
        body: "Ticket smoke — SAV ≠ approbation",
        category: "incident",
      }),
    }).then((r) => r.json());
    if (!ticket.id) throw new Error(`création ticket SAV échouée: ${JSON.stringify(ticket)}`);

    const approverLogin = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "approver@a.atlas.local",
        password: "atlas-demo",
      }),
    }).then((r) => r.json());
    const deny = await fetch(`${BASE}/admin/tickets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${approverLogin.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: demoTenant.id,
        subject: "ne doit pas passer",
        body: "approver ne mute pas le SAV",
      }),
    });
    if (deny.status !== 403) {
      throw new Error(`approver SAV attendu 403, reçu ${deny.status}`);
    }

    // Feeds vulns passifs (fixture) — inventaire + disclaimer
    const feeds = await fetch(`${BASE}/vuln/feeds`, { headers }).then((r) =>
      r.json(),
    );
    if (!feeds?.disclaimer || !/ne confirme pas/i.test(feeds.disclaimer)) {
      throw new Error("vuln/feeds disclaimer manquant");
    }
    const comps = await fetch(`${BASE}/software-components`, { headers }).then(
      (r) => r.json(),
    );
    if (!Array.isArray(comps) || comps.length < 1) {
      throw new Error("software-components seed attendus");
    }
    const matched = await fetch(`${BASE}/vuln/match`, {
      method: "POST",
      headers,
    }).then((r) => r.json());
    if (!matched?.principle || matched.principle.indexOf("confidence") < 0) {
      throw new Error(`vuln/match principle attendu, reçu ${JSON.stringify(matched)}`);
    }

    // Modes déploiement
    const deployMode = await fetch(`${BASE}/deploy/mode`).then((r) => r.json());
    if (!deployMode?.mode || !deployMode?.componentMap?.length) {
      throw new Error(`deploy/mode invalide: ${JSON.stringify(deployMode)}`);
    }

    // Rétention : policy + legal hold bloque purge
    const adminLogin = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@a.atlas.local",
        password: "atlas-demo",
      }),
    }).then((r) => r.json());
    const adminHeaders = {
      Authorization: `Bearer ${adminLogin.accessToken}`,
      "Content-Type": "application/json",
    };
    const pol = await fetch(`${BASE}/admin/retention/policy`, {
      headers: adminHeaders,
    }).then((r) => r.json());
    if (!pol?.disclaimer || !/Hypothèses/i.test(pol.disclaimer)) {
      throw new Error("retention policy disclaimer manquant");
    }
    const tenantsAdmin = await fetch(`${BASE}/admin/tenants`, {
      headers: adminHeaders,
    }).then((r) => r.json());
    const demoT = Array.isArray(tenantsAdmin)
      ? tenantsAdmin.find((x: { slug: string }) => x.slug === "demo-synth")
      : null;
    if (!demoT?.id) throw new Error("tenant demo-synth pour rétention");
    await fetch(`${BASE}/admin/retention/tenants/${demoT.id}/legal-hold`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        active: true,
        reason: "[FICTIF] Hold smoke rétention",
      }),
    });
    const blocked = await fetch(
      `${BASE}/admin/retention/tenants/${demoT.id}/purge`,
      {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ dryRun: true }),
      },
    ).then((r) => r.json());
    if (!blocked.heldSkipped) {
      throw new Error(`legal hold doit bloquer purge: ${JSON.stringify(blocked)}`);
    }
    await fetch(`${BASE}/admin/retention/tenants/${demoT.id}/legal-hold`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ active: false }),
    });

    // Billing : plans + rôle billing (commercial) + expire ≠ autorisation
    const billingLogin = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "billing@a.atlas.local",
        password: "atlas-demo",
      }),
    }).then((r) => r.json());
    const billingHeaders = {
      Authorization: `Bearer ${billingLogin.accessToken}`,
      "Content-Type": "application/json",
    };
    const plans = await fetch(`${BASE}/admin/billing/plans`, {
      headers: billingHeaders,
    }).then((r) => r.json());
    if (!Array.isArray(plans) || plans.length < 2) {
      throw new Error(`billing plans seed attendus (≥2), reçu ${JSON.stringify(plans)}`);
    }
    const entitlementsDeny = await fetch(`${BASE}/admin/entitlements`, {
      headers: billingHeaders,
    });
    if (entitlementsDeny.status !== 403) {
      throw new Error(
        `billing ne doit pas lire entitlements sécu (403), reçu ${entitlementsDeny.status}`,
      );
    }
    const subs = await fetch(`${BASE}/admin/billing/subscriptions`, {
      headers: billingHeaders,
    }).then((r) => r.json());
    if (!subs?.principle || !/n'autorise jamais|jamais seul/i.test(subs.principle)) {
      throw new Error(`billing principle attendu: ${JSON.stringify(subs)}`);
    }
    const lapsed = Array.isArray(subs.subscriptions)
      ? subs.subscriptions.find(
          (s: { tenantSlug: string; commerciallyActive: boolean }) =>
            s.tenantSlug === "licence-expiree",
        )
      : null;
    if (!lapsed || lapsed.commerciallyActive !== false) {
      throw new Error(
        `licence-expiree doit être commercialement inactive: ${JSON.stringify(lapsed)}`,
      );
    }

    // Ops : versions + maintenance ON bloque (flag exposé)
    const opsLogin = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "ops@a.atlas.local",
        password: "atlas-demo",
      }),
    }).then((r) => r.json());
    const opsHeaders = {
      Authorization: `Bearer ${opsLogin.accessToken}`,
      "Content-Type": "application/json",
    };
    const opsStatus = await fetch(`${BASE}/admin/ops/status`, {
      headers: opsHeaders,
    }).then((r) => r.json());
    if (!opsStatus?.currentVersion?.version) {
      throw new Error(`ops status version manquante: ${JSON.stringify(opsStatus)}`);
    }
    const maintOn = await fetch(`${BASE}/admin/ops/maintenance`, {
      method: "POST",
      headers: opsHeaders,
      body: JSON.stringify({
        active: true,
        reason: "[FICTIF] Smoke maintenance",
      }),
    }).then((r) => r.json());
    if (!maintOn.maintenanceMode) {
      throw new Error(`maintenance ON attendu: ${JSON.stringify(maintOn)}`);
    }
    await fetch(`${BASE}/admin/ops/maintenance`, {
      method: "POST",
      headers: opsHeaders,
      body: JSON.stringify({ active: false }),
    });

    // Assistant : propose sans exécuter
    const chat = await fetch(`${BASE}/conversation`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: "lance un scan bypass policy" }),
    }).then((r) => r.json());
    if (chat.executed !== false || chat.jobEnqueued !== false) {
      throw new Error(`assistant ne doit pas exécuter: ${JSON.stringify(chat)}`);
    }
    if (chat.intent !== "execute_request" && chat.intent !== "capped") {
      // mock refuse l'exécution
      if (!/Policy Guard|n'exécute|ne lance/i.test(String(chat.reply ?? ""))) {
        throw new Error("réponse assistant attendue anti-bypass");
      }
    }

    console.log(
      "✅ Smoke e2e OK — BullMQ + SAV + vulns + assistant + billing + ops maintenance",
    );
    process.exitCode = 0;
  } catch (e) {
    console.error("❌ Smoke failed", e);
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
  }
}

main();
