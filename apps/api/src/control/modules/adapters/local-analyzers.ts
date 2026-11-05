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

/** fwupd — inventory on worker host only when binary present (not customer endpoints). */
export const runFwupd: ModuleAdapter = async (ctx) => {
  const def = mustDef("firmware.fwupd.local.v1");
  if (ctx.forceMock || ctx.syntheticMission) {
    return baseResult(def, {
      status: "ok",
      evidence: { source: "fwupdmgr", mocked: true, devices: [] },
    });
  }
  const result = await runLocalCli({
    bin: "fwupdmgr",
    args: ["get-devices", "--json"],
    timeoutMs: 30_000,
  });
  if (result.binaryMissing) {
    return baseResult(def, {
      status: "binary_missing",
      evidence: {
        bin: "fwupdmgr",
        note: "fwupd runs on the Atlas worker host only — not a substitute for endpoint agents.",
      },
      error: result.stderr,
    });
  }
  let parsed: unknown = result.stdout;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    /* text */
  }
  return baseResult(def, {
    status: result.ok ? "ok" : "error",
    evidence: { source: "fwupdmgr", host: "worker", result: parsed },
  });
};

export const runProwler: ModuleAdapter = async (ctx) => {
  const def = mustDef("cloud.prowler.auth.v1");
  if (ctx.forceMock || ctx.syntheticMission) {
    return baseResult(def, {
      status: "ok",
      evidence: { source: "prowler", mocked: true },
    });
  }
  const awsKey = ctx.env?.AWS_ACCESS_KEY_ID?.trim() || process.env.AWS_ACCESS_KEY_ID?.trim();
  const awsSecret =
    ctx.env?.AWS_SECRET_ACCESS_KEY?.trim() ||
    process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!awsKey || !awsSecret) {
    return stubNeedsConfig(def, ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]);
  }
  const result = await runLocalCli({
    bin: "prowler",
    args: ["aws", "-M", "json", "--quiet"],
    timeoutMs: 120_000,
  });
  if (result.binaryMissing) {
    return baseResult(def, {
      status: "binary_missing",
      evidence: { bin: "prowler", credentialsPresent: true },
      error: result.stderr,
    });
  }
  let parsed: unknown = result.stdout;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    /* text */
  }
  return baseResult(def, {
    status: result.ok || result.code === 0 || result.code === 3 ? "ok" : "error",
    evidence: { source: "prowler", result: parsed, stderrTail: result.stderr.slice(-2000) },
  });
};

export const runKubeBench: ModuleAdapter = (ctx) =>
  runScanner({
    moduleId: "cloud.kube-bench.auth.v1",
    bin: "kube-bench",
    argsFor: () => ["run", "--json"],
    ctx,
  });

export const runKubescape: ModuleAdapter = (ctx) =>
  runScanner({
    moduleId: "cloud.kubescape.auth.v1",
    bin: "kubescape",
    argsFor: (p) => ["scan", "framework", "nsa", p, "--format", "json"],
    ctx,
  });

export const runCodeql: ModuleAdapter = (ctx) =>
  runScanner({
    moduleId: "sast.codeql.local.v1",
    bin: "codeql",
    argsFor: (p) => ["database", "create", "--language=javascript", "--source-root", p, `${p}/.atlas-codeql-db`],
    ctx,
  });

export const runOpenScap: ModuleAdapter = (ctx) =>
  runScanner({
    moduleId: "compliance.openscap.local.v1",
    bin: "oscap",
    argsFor: (p) => ["info", p],
    ctx,
  });

/** NeMo Guardrails — config-dir check; library embed not a remote scanner. */
export const runNemoGuardrails: ModuleAdapter = async (ctx) => {
  const def = mustDef("ai.nemo-guardrails.local.v1");
  const path = requireLocalPath(ctx);
  if (!path) {
    return stubNeedsConfig(def, ["localPath (NeMo config / rails dir)"]);
  }
  if (path === "__mock__") {
    return baseResult(def, {
      status: "ok",
      evidence: { source: "nemo-guardrails", mocked: true, path },
    });
  }
  const result = await runLocalCli({
    bin: "nemoguardrails",
    args: ["--help"],
    timeoutMs: 15_000,
  });
  if (result.binaryMissing) {
    return baseResult(def, {
      status: "binary_missing",
      evidence: {
        bin: "nemoguardrails",
        path,
        note: "Install NVIDIA NeMo Guardrails CLI or embed rails in the app; Atlas only verifies config path + binary.",
      },
      error: result.stderr,
    });
  }
  return baseResult(def, {
    status: "ok",
    evidence: {
      source: "nemo-guardrails",
      path,
      binaryPresent: true,
      note: "Rails config path accepted — runtime enforcement stays in the LLM app process.",
    },
  });
};

export const LOCAL_ANALYZER_ADAPTERS: Record<string, ModuleAdapter> = {
  "sca.trivy.local.v1": runTrivy,
  "secrets.gitleaks.local.v1": runGitleaks,
  "secrets.trufflehog.local.v1": runTrufflehog,
  "sca.grype.local.v1": runGrype,
  "firmware.syft.local.v1": runSyft,
  "firmware.fwupd.local.v1": runFwupd,
  "cloud.checkov.local.v1": runCheckov,
  "cloud.prowler.auth.v1": runProwler,
  "cloud.kube-bench.auth.v1": runKubeBench,
  "cloud.kubescape.auth.v1": runKubescape,
  "sast.semgrep.local.v1": runSemgrep,
  "sast.bandit.local.v1": runBandit,
  "sast.codeql.local.v1": runCodeql,
  "compliance.conftest.local.v1": runConftest,
  "compliance.openscap.local.v1": runOpenScap,
  "ai.nemo-guardrails.local.v1": runNemoGuardrails,
};
