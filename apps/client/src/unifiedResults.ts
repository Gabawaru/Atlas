/** Vue résultats unifiée — services/modules + findings dans une seule liste (pas de silo). */

export type UnifiedResultKind = "service" | "finding" | "report";

export type UnifiedResultRow = {
  id: string;
  kind: UnifiedResultKind;
  title: string;
  detail: string;
  severity?: string;
  synthetic?: boolean;
};

export type MissionLike = {
  id: string;
  title: string;
  status: string;
  synthetic?: boolean;
  findings?: {
    id: string;
    title: string;
    summary: string;
    severity: string;
    synthetic?: boolean;
  }[];
  jobRuns?: {
    id: string;
    status: string;
    progressPercent: number;
    progressMessage?: string | null;
  }[];
  reports?: {
    id: string;
    executiveSummary: string;
    synthetic?: boolean;
  }[];
};

export type FindingLike = {
  id: string;
  title: string;
  summary: string;
  severity: string;
  synthetic?: boolean;
  mission?: { id: string; title: string };
};

/**
 * Fusionne jobs (services/modules), findings et bilans en une liste unique.
 * Findings déjà présents via mission ne sont pas dupliqués depuis la liste plate.
 */
export function buildUnifiedResults(
  missions: MissionLike[],
  findings: FindingLike[],
): UnifiedResultRow[] {
  const rows: UnifiedResultRow[] = [];
  const findingIds = new Set<string>();

  for (const m of missions) {
    for (const job of m.jobRuns ?? []) {
      rows.push({
        id: `job:${job.id}`,
        kind: "service",
        title: `Contrôle passif — ${m.title}`,
        detail: `${job.status} · ${job.progressPercent}%${
          job.progressMessage ? ` · ${job.progressMessage}` : ""
        }`,
        synthetic: m.synthetic,
      });
    }
    for (const f of m.findings ?? []) {
      findingIds.add(f.id);
      rows.push({
        id: `finding:${f.id}`,
        kind: "finding",
        title: f.title,
        detail: f.summary,
        severity: f.severity,
        synthetic: f.synthetic,
      });
    }
    for (const r of m.reports ?? []) {
      rows.push({
        id: `report:${r.id}`,
        kind: "report",
        title: `Bilan — ${m.title}`,
        detail: r.executiveSummary,
        synthetic: r.synthetic ?? m.synthetic,
      });
    }
  }

  for (const f of findings) {
    if (findingIds.has(f.id)) continue;
    rows.push({
      id: `finding:${f.id}`,
      kind: "finding",
      title: f.title,
      detail: f.summary,
      severity: f.severity,
      synthetic: f.synthetic,
    });
  }

  return rows;
}

export function kindLabel(kind: UnifiedResultKind): string {
  if (kind === "service") return "Service";
  if (kind === "finding") return "Finding";
  return "Bilan";
}
