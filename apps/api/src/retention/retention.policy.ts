/**
 * TTL + finalités produit — HYPOTHÈSES de conception FR/RGPD.
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

/**
 * Finalités de traitement produit (limitation de finalité — hypothèse code).
 * Pas une liste exhaustive légale ; sous-ensemble MVP Atlas.
 */
export const PROCESSING_PURPOSES = [
  "authorized_passive_control",
  "mission_authorization",
  "assistant_chat",
  "audit_trail",
  "retention_ops",
  "subscription_billing",
] as const;

export type ProcessingPurpose = (typeof PROCESSING_PURPOSES)[number];

/**
 * Purposes acceptés par SignatureProvider.sign — sous-ensemble opérationnel.
 * Absent / vide = autorisé (champ historique optionnel).
 */
export const SIGN_PURPOSES = ["chat", "mission"] as const;

export type SignPurpose = (typeof SIGN_PURPOSES)[number];

export const PURPOSE_DISCLAIMER =
  "Finalités produit déclarées dans le code (hypothèse limitation) — " +
  "pas une base légale validée, pas un registre des traitements, pas un avis DPO.";

/** true sauf si ATLAS_PURPOSE_ENFORCE=false (opt-out démo uniquement). */
export function isPurposeEnforceEnabled(
  env: NodeJS.Dict<string> | Record<string, string | undefined> = process.env,
): boolean {
  const raw = (env.ATLAS_PURPOSE_ENFORCE ?? "true").toLowerCase().trim();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

export function isAllowedProcessingPurpose(purpose: string): boolean {
  return (PROCESSING_PURPOSES as readonly string[]).includes(purpose);
}

export function isAllowedSignPurpose(
  purpose: string | undefined | null,
): boolean {
  if (purpose === undefined || purpose === null || purpose === "") return true;
  return (SIGN_PURPOSES as readonly string[]).includes(purpose);
}

export function cutoffDate(days: number, now = new Date()): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}
