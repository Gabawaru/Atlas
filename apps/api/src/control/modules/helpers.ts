/**
 * Shared helpers for shortlist module adapters.
 * Reuses RoE / scope asserts from web-passive — never bypasses Policy Guard.
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import {
  assertInScope,
  normalizeHost,
} from "../web-passive";
import type {
  ModuleDefinition,
  ModuleRunContext,
  ModuleRunResult,
} from "./types";
import {
  MODULE_DISCLAIMER_PASSIVE,
  MODULE_DISCLAIMER_STUB,
} from "./types";

export { normalizeHost };

export function hashJson(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function assertAllTargetsInScope(ctx: ModuleRunContext): void {
  for (const t of ctx.targets) {
    const host = normalizeHost(t.host || t.url || "");
    assertInScope(host, ctx.allowedHosts, ctx.exclusions, {
      // Suite runs inside already-gated job; still enforce platform RoE
      // unless synthetic demo override (same as web-passive worker).
      enforceRoePlatform: true,
      roeScopeOverride: ctx.syntheticMission === true,
    });
  }
}

export function baseResult(
  def: ModuleDefinition,
  partial: Omit<ModuleRunResult, "moduleId" | "shortlistTool" | "observedAt" | "disclaimer"> & {
    disclaimer?: string;
  },
): ModuleRunResult {
  return {
    moduleId: def.id,
    shortlistTool: def.shortlistTool,
    observedAt: new Date().toISOString(),
    disclaimer:
      partial.disclaimer ??
      (def.wireStatus === "wired"
        ? MODULE_DISCLAIMER_PASSIVE
        : MODULE_DISCLAIMER_STUB),
    ...partial,
  };
}

export function stubNeedsConfig(
  def: ModuleDefinition,
  missing: string[],
): ModuleRunResult {
  const requiredEnv = missing.length
    ? missing
    : [...(def.envKeys ?? [])];
  return baseResult(def, {
    status: "needs_config",
    evidence: {
      wireStatus: def.wireStatus,
      wireNote: def.wireNote,
      missingEnv: missing,
      requiredEnv,
    },
    error: `Configuration manquante: ${requiredEnv.join(", ") || def.wireNote || "n/a"}`,
  });
}

/** Resolve required env keys; empty map → needs_config list. */
export function requireAllEnv(
  env: NodeJS.ProcessEnv | undefined,
  keys: string[],
): { ok: true; values: Record<string, string> } | { ok: false; missing: string[] } {
  const e = env ?? process.env;
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const k of keys) {
    const v = e[k]?.trim();
    if (!v) missing.push(k);
    else values[k] = v;
  }
  if (missing.length) return { ok: false, missing };
  return { ok: true, values };
}

/**
 * Keyed auth/passive adapter skeleton:
 * - forceMock/synthetic → synthetic evidence (no live call)
 * - missing env → needs_config with requiredEnv
 * - else → call fetchLive and wrap evidence
 */
export async function runKeyedAdapter(opts: {
  def: ModuleDefinition;
  ctx: ModuleRunContext;
  requiredKeys: string[];
  /** Any-of groups: each inner array is alternatives for one logical secret */
  anyOfKeys?: string[][];
  source: string;
  mockEvidence?: unknown;
  /** Scope assert before live/mock (default true for target-based modules) */
  assertScope?: boolean;
  fetchLive: (args: {
    ctx: ModuleRunContext;
    values: Record<string, string>;
    fetch: typeof fetch;
  }) => Promise<unknown>;
}): Promise<ModuleRunResult> {
  const { def, ctx } = opts;
  if (opts.assertScope !== false) {
    assertAllTargetsInScope(ctx);
  }

  if (ctx.forceMock || ctx.syntheticMission) {
    return baseResult(def, {
      status: "ok",
      evidence: {
        source: opts.source,
        mocked: true,
        synthetic: true,
        ...(typeof opts.mockEvidence === "object" && opts.mockEvidence
          ? (opts.mockEvidence as object)
          : { mock: opts.mockEvidence ?? true }),
      },
      findings: [
        {
          severity: "info",
          title: `${def.label} (mock)`,
          summary: "Preuve synthétique — aucun appel live.",
        },
      ],
    });
  }

  const required = [...opts.requiredKeys];
  const values: Record<string, string> = {};
  const e = ctx.env ?? process.env;

  for (const k of opts.requiredKeys) {
    const v = e[k]?.trim();
    if (v) values[k] = v;
  }

  const missingRequired = opts.requiredKeys.filter((k) => !values[k]);
  const missingAnyOf: string[] = [];
  for (const group of opts.anyOfKeys ?? []) {
    const hit = group.find((k) => e[k]?.trim());
    if (hit) {
      values[hit] = e[hit]!.trim();
      // alias first key for adapters that expect a canonical name
      if (!values[group[0]!]) values[group[0]!] = values[hit]!;
    } else {
      missingAnyOf.push(group.join("|"));
      missingRequired.push(...group);
    }
  }

  if (missingRequired.length || missingAnyOf.length) {
    const listed = [
      ...opts.requiredKeys.filter((k) => !values[k]),
      ...missingAnyOf,
    ];
    return stubNeedsConfig(def, listed.length ? listed : required);
  }

  try {
    const evidenceBody = await opts.fetchLive({
      ctx,
      values,
      fetch: ctxFetch(ctx),
    });
    await sleepRate(ctx, def.rateLimitPerMinuteDefault);
    return baseResult(def, {
      status: "ok",
      evidence: {
        source: opts.source,
        live: true,
        evidenceHash: hashJson(evidenceBody),
        result: evidenceBody,
      },
      findings: [
        {
          severity: "info",
          title: def.label,
          summary: `Connecteur authentifié ${opts.source} — lecture seule / in-scope.`,
        },
      ],
    });
  } catch (err) {
    return baseResult(def, {
      status: "error",
      evidence: { source: opts.source },
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function stubBlocked(def: ModuleDefinition): ModuleRunResult {
  return baseResult(def, {
    status: "skipped",
    evidence: { wireStatus: "blocked", wireNote: def.wireNote },
    error: def.wireNote ?? "Module bloqué (contraintes Atlas)",
  });
}

export function stubCatalog(def: ModuleDefinition): ModuleRunResult {
  return baseResult(def, {
    status: "needs_config",
    evidence: {
      wireStatus: def.wireStatus,
      wireNote: def.wireNote,
      envKeys: def.envKeys ?? [],
    },
    error: def.wireNote ?? "Stub — connecteur / clés non branchés",
  });
}

export function envHasAny(
  env: NodeJS.ProcessEnv | undefined,
  keys: string[],
): string | undefined {
  const e = env ?? process.env;
  for (const k of keys) {
    const v = e[k];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

export function missingEnvKeys(
  env: NodeJS.ProcessEnv | undefined,
  keys: string[] | undefined,
): string[] {
  if (!keys?.length) return [];
  const e = env ?? process.env;
  return keys.filter((k) => !e[k]?.trim());
}

export async function sleepRate(
  ctx: ModuleRunContext,
  perMinute?: number,
): Promise<void> {
  const rpm = Math.max(1, perMinute ?? ctx.rateLimitPerMinute);
  const ms = Math.ceil(60_000 / rpm);
  const sleep =
    ctx.sleepFn ?? ((m: number) => new Promise((r) => setTimeout(r, m)));
  if (!ctx.forceMock) await sleep(ms);
}

export async function whichBinary(bin: string): Promise<string | null> {
  const candidates =
    process.platform === "win32"
      ? [`${bin}.exe`, bin]
      : [bin, `/usr/local/bin/${bin}`, `/usr/bin/${bin}`, `${process.env.HOME}/go/bin/${bin}`];
  for (const c of candidates) {
    try {
      await access(c, fsConstants.X_OK);
      return c;
    } catch {
      /* try next */
    }
  }
  // PATH lookup via `command -v`
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", `command -v ${bin}`], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString();
    });
    child.on("close", (code) => {
      resolve(code === 0 && out.trim() ? out.trim() : null);
    });
    child.on("error", () => resolve(null));
  });
}

export async function runLocalCli(opts: {
  bin: string;
  args: string[];
  timeoutMs?: number;
  cwd?: string;
}): Promise<{
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  binaryMissing?: boolean;
}> {
  const path = await whichBinary(opts.bin);
  if (!path) {
    return {
      ok: false,
      code: null,
      stdout: "",
      stderr: `${opts.bin} not found on PATH`,
      binaryMissing: true,
    };
  }
  return new Promise((resolve) => {
    const child = spawn(path, opts.args, {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CI: "1" },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, opts.timeoutMs ?? 60_000);
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
      if (stdout.length > 512_000) stdout = stdout.slice(0, 512_000);
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 128_000) stderr = stderr.slice(0, 128_000);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: e.message,
      });
    });
  });
}

export function ctxFetch(ctx: ModuleRunContext): typeof fetch {
  return ctx.fetchFn ?? fetch;
}

/** Apex hosts only (exact allowlist entries). */
export function apexTargets(ctx: ModuleRunContext): string[] {
  const allow = [...ctx.allowedHosts].map(normalizeHost);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of ctx.targets) {
    const h = normalizeHost(t.host || t.url || "");
    if (!h || seen.has(h)) continue;
    if (allow.includes(h) || allow.some((a) => h === a)) {
      seen.add(h);
      out.push(h);
    }
  }
  // Fallback: unique target hosts still in scope
  if (out.length === 0) {
    for (const t of ctx.targets) {
      const h = normalizeHost(t.host || t.url || "");
      if (h && !seen.has(h)) {
        seen.add(h);
        out.push(h);
      }
    }
  }
  return out;
}
