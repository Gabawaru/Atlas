/**
 * TTL par catégorie — HYPOTHÈSES de conception FR/RGPD.
 * Ce n'est PAS une certification CNIL, ni un avis juridique, ni une AIPD.
 * À valider avec DPO / conseil d'A avant prod.
 *
 * Alignement indicatif store `modele-donnees.md` §6 (R4–R6).
 */

export const RETENTION_CATEGORIES = [
  "audit",
  "reports",
  "artefacts",
  "pii_minimized",
  "llm_usage",
] as const;

export type RetentionCategory = (typeof RETENTION_CATEGORIES)[number];

export interface RetentionTtlDays {
  /** R5 — Audit technique (hypothèse 365 j hot) */
  audit: number;
  /** R4 — Rapports / bilans (hypothèse 365 j) */
  reports: number;
  /** R4 — Artefacts job (evidenceJson, PDF disque) */
  artefacts: number;
  /** Minimisation PII dans findings.technical (hypothèse 180 j) */
  pii_minimized: number;
  /** R6 — Métadonnées usage LLM (hypothèse 90 j) */
  llm_usage: number;
}

export const DEFAULT_RETENTION_TTL_DAYS: RetentionTtlDays = {
  audit: Number(process.env.ATLAS_TTL_AUDIT_DAYS ?? 365),
  reports: Number(process.env.ATLAS_TTL_REPORTS_DAYS ?? 365),
  artefacts: Number(process.env.ATLAS_TTL_ARTEFACTS_DAYS ?? 365),
  pii_minimized: Number(process.env.ATLAS_TTL_PII_DAYS ?? 180),
  llm_usage: Number(process.env.ATLAS_TTL_LLM_DAYS ?? 90),
};

export const RETENTION_DISCLAIMER =
  "Hypothèses de rétention FR/RGPD documentées comme telles — " +
  "pas une analyse d'impact, pas une base légale validée, pas une certification. " +
  "Legal hold bloque toute auto-suppression.";

export function cutoffDate(days: number, now = new Date()): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}
