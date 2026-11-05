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
  return baseResult(def, {
    status: "needs_config",
    evidence: {
      wireStatus: def.wireStatus,
      wireNote: def.wireNote,
      missingEnv: missing,
    },
    error: `Configuration manquante: ${missing.join(", ") || def.wireNote || "n/a"}`,
  });
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
