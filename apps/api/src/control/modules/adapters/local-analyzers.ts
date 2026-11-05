/**
 * Local/CI analyzer adapters — run only against ctx.localPath (tenant artefact).
 * Never probe remote hosts. Binary missing → binary_missing (honest status).
 */
import { getModuleDefinition } from "../registry";
import type { ModuleAdapter } from "../types";
import {
  baseResult,
  runLocalCli,
  stubNeedsConfig,
} from "../helpers";

function mustDef(id: string) {
  const d = getModuleDefinition(id);
  if (!d) throw new Error(`module def missing: ${id}`);
  return d;
}

function requireLocalPath(ctx: { localPath?: string; forceMock: boolean; syntheticMission: boolean }) {
  if (ctx.forceMock || ctx.syntheticMission) return "__mock__";
  return ctx.localPath;
}

async function runScanner(opts: {
  moduleId: string;
  bin: string;
  argsFor: (path: string) => string[];
  ctx: Parameters<ModuleAdapter>[0];
}) {
  const def = mustDef(opts.moduleId);
  const path = requireLocalPath(opts.ctx);
  if (!path) {
    return stubNeedsConfig(def, ["localPath (job artefact)"]);
  }
  if (path === "__mock__") {
    return baseResult(def, {
      status: "ok",
      evidence: {
        source: opts.bin,
        mocked: true,
        path,
        findings: [],
        note: "Mock local analyzer — binaire non invoqué",
      },
    });
  }
  if (opts.ctx.isCancelled()) {
    return baseResult(def, {
      status: "skipped",
      evidence: { cancelled: true },
    });
  }
  const result = await runLocalCli({
    bin: opts.bin,
    args: opts.argsFor(path),
    timeoutMs: 90_000,
    cwd: path,
  });
  if (result.binaryMissing) {
    return baseResult(def, {
      status: "binary_missing",
      evidence: { bin: opts.bin, path },
      error: result.stderr,
    });
  }
  let parsed: unknown = result.stdout;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    /* keep text */
  }
  return baseResult(def, {
    status: result.ok || result.code === 0 || result.code === 1 ? "ok" : "error",
    evidence: {
      source: opts.bin,
      path,
      code: result.code,
      result: parsed,
      stderrTail: result.stderr.slice(-2000),
    },
    error: result.ok ? undefined : result.stderr.slice(0, 500),
  });
}

export const runTrivy: ModuleAdapter = (ctx) =>
  runScanner({
    moduleId: "sca.trivy.local.v1",
    bin: "trivy",
    argsFor: (p) => ["fs", "--quiet", "--format", "json", p],
    ctx,
  });

export const runGitleaks: ModuleAdapter = (ctx) =>
  runScanner({
    moduleId: "secrets.gitleaks.local.v1",
    bin: "gitleaks",
    argsFor: (p) => ["detect", "--source", p, "--report-format", "json", "--no-banner"],
    ctx,
  });

export const runTrufflehog: ModuleAdapter = (ctx) =>
  runScanner({
    moduleId: "secrets.trufflehog.local.v1",
    bin: "trufflehog",
    argsFor: (p) => ["filesystem", p, "--json", "--no-update"],
    ctx,
  });

export const runGrype: ModuleAdapter = (ctx) =>
  runScanner({
    moduleId: "sca.grype.local.v1",
    bin: "grype",
    argsFor: (p) => [`dir:${p}`, "-o", "json"],
    ctx,
  });

export const runSyft: ModuleAdapter = (ctx) =>
  runScanner({
    moduleId: "firmware.syft.local.v1",
    bin: "syft",
    argsFor: (p) => [`dir:${p}`, "-o", "json"],
    ctx,
  });

export const runCheckov: ModuleAdapter = (ctx) =>
  runScanner({
    moduleId: "cloud.checkov.local.v1",
    bin: "checkov",
    argsFor: (p) => ["-d", p, "-o", "json", "--quiet"],
    ctx,
  });

export const runSemgrep: ModuleAdapter = (ctx) =>
  runScanner({
    moduleId: "sast.semgrep.local.v1",
    bin: "semgrep",
    argsFor: (p) => ["--config", "auto", "--json", p],
    ctx,
  });

export const runBandit: ModuleAdapter = (ctx) =>
  runScanner({
    moduleId: "sast.bandit.local.v1",
    bin: "bandit",
    argsFor: (p) => ["-r", p, "-f", "json", "-q"],
    ctx,
  });

export const runConftest: ModuleAdapter = (ctx) =>
  runScanner({
    moduleId: "compliance.conftest.local.v1",
    bin: "conftest",
    argsFor: (p) => ["test", p, "--output", "json"],
    ctx,
  });

export const LOCAL_ANALYZER_ADAPTERS: Record<string, ModuleAdapter> = {
  "sca.trivy.local.v1": runTrivy,
  "secrets.gitleaks.local.v1": runGitleaks,
  "secrets.trufflehog.local.v1": runTrufflehog,
  "sca.grype.local.v1": runGrype,
  "firmware.syft.local.v1": runSyft,
  "cloud.checkov.local.v1": runCheckov,
  "sast.semgrep.local.v1": runSemgrep,
  "sast.bandit.local.v1": runBandit,
  "compliance.conftest.local.v1": runConftest,
};
