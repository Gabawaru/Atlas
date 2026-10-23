/**
 * Smoke e2e léger : exige DATABASE_URL joignable (docker-compose up -d).
 * Quitte avec code 0 si OK, 77 si infra absente (skip CI soft), 1 si échec logique.
 */
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://atlas:atlas_dev_only@localhost:5432/atlas?schema=public";
const API_PORT = Number(process.env.API_PORT ?? 3001);
const BASE = `http://127.0.0.1:${API_PORT}/v1`;

async function canReachPostgres(): Promise<boolean> {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$disconnect();
    return true;
  } catch {
    return false;
  }
}

async function main() {
  process.env.DATABASE_URL = DATABASE_URL;
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? "dev-only-change-me-not-a-real-secret";

  if (!(await canReachPostgres())) {
    console.warn(
      "SKIP smoke: Postgres injoignable. Lancez `docker compose up -d` puis `pnpm db:migrate && pnpm db:seed`.",
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

    const assets = await fetch(`${BASE}/assets`, { headers }).then((r) => r.json());
    if (!Array.isArray(assets) || assets.length < 1) throw new Error("assets seed manquants");

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

    console.log("✅ Smoke e2e OK — parcours démo synthétique → rapport");
    process.exitCode = 0;
  } catch (e) {
    console.error("❌ Smoke failed", e);
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
  }
}

main();
