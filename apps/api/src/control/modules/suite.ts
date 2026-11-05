/**
 * Cooperating module suite — shared mission context, sequential rate-limited runs.
 * Parent Policy Guard module remains web.passive.presence.v1.
 */
import {
  DEFAULT_LOCAL_SUITE_IDS,
  DEFAULT_PASSIVE_SUITE_IDS,
  getModuleDefinition,
  SHORTLIST_MODULE_REGISTRY,
} from "./registry";
import { PASSIVE_API_ADAPTERS } from "./adapters/passive-api";
import { LOCAL_ANALYZER_ADAPTERS } from "./adapters/local-analyzers";
import {
  stubBlocked,
  stubCatalog,
} from "./helpers";
import type {
  ModuleAdapter,
  ModuleRunContext,
  ModuleRunResult,
} from "./types";

const ADAPTERS: Record<string, ModuleAdapter> = {
  ...PASSIVE_API_ADAPTERS,
  ...LOCAL_ANALYZER_ADAPTERS,
};

export function resolveAdapter(moduleId: string): ModuleAdapter | undefined {
  return ADAPTERS[moduleId];
}

export function listRunnableModuleIds(): string[] {
  return Object.keys(ADAPTERS);
}

/**
 * Run a suite of shortlist modules against shared context.
 * Blocked → skipped; stub without adapter → needs_config; wired → adapter.
 */
export async function runCooperatingSuite(
  moduleIds: string[],
  ctx: ModuleRunContext,
): Promise<ModuleRunResult[]> {
  const results: ModuleRunResult[] = [];
  const prior: Record<string, unknown> = { ...ctx.priorEvidence };

  for (const id of moduleIds) {
    if (ctx.isCancelled()) break;
    const def = getModuleDefinition(id);
    const started = Date.now();
    let result: ModuleRunResult;

    if (!def) {
      result = {
        moduleId: id,
        shortlistTool: "unknown",
        status: "error",
        observedAt: new Date().toISOString(),
        evidence: {},
        disclaimer: "Module inconnu du registre shortlist",
        error: `UNKNOWN_MODULE: ${id}`,
      };
    } else if (def.wireStatus === "blocked") {
      result = stubBlocked(def);
    } else {
      const adapter = ADAPTERS[id];
      if (!adapter) {
        result = stubCatalog(def);
      } else {
        try {
          result = await adapter({
            ...ctx,
            priorEvidence: prior,
          });
        } catch (e) {
          result = {
            moduleId: def.id,
            shortlistTool: def.shortlistTool,
            status: "error",
            observedAt: new Date().toISOString(),
            evidence: {},
            disclaimer: def.wireNote ?? "adapter error",
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }
    }

    result.durationMs = Date.now() - started;
    results.push(result);
    prior[id] = result.evidence;
  }

  return results;
}

export type SuitePlan = {
  passiveIds: string[];
  localIds: string[];
};

/**
 * Build default suite for a mission job.
 * localPath present → append local analyzers that are wired.
 */
export function planDefaultSuite(opts?: {
  includePassive?: boolean;
  includeLocal?: boolean;
  localPath?: string;
  extraIds?: string[];
  excludeIds?: string[];
}): SuitePlan {
  const exclude = new Set(opts?.excludeIds ?? []);
  const passiveIds =
    opts?.includePassive === false
      ? []
      : DEFAULT_PASSIVE_SUITE_IDS.filter((id) => !exclude.has(id));
  const localIds =
    opts?.includeLocal === false || !opts?.localPath
      ? []
      : DEFAULT_LOCAL_SUITE_IDS.filter((id) => !exclude.has(id));
  const extras = (opts?.extraIds ?? []).filter((id) => !exclude.has(id));
  return {
    passiveIds: [...passiveIds, ...extras.filter((e) => !localIds.includes(e))],
    localIds,
  };
}

export function suiteEvidenceSummary(results: ModuleRunResult[]) {
  const byStatus: Record<string, number> = {};
  for (const r of results) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }
  return {
    moduleCount: results.length,
    byStatus,
    moduleIds: results.map((r) => r.moduleId),
    findings: results.flatMap((r) => r.findings ?? []),
  };
}

export function registryPublicCatalog() {
  return SHORTLIST_MODULE_REGISTRY.map((m) => ({
    id: m.id,
    shortlistTool: m.shortlistTool,
    category: m.category,
    kind: m.kind,
    label: m.label,
    wireStatus: m.wireStatus,
    wireNote: m.wireNote,
    connectorId: m.connectorId,
    parentModuleId: m.parentModuleId,
    cooperatesWith: m.cooperatesWith,
    runnable: Boolean(ADAPTERS[m.id]),
  }));
}
