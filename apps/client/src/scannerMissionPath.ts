/**
 * Scanner CTA path selection — FICTIF (demo) vs real (Sign envelope attach).
 * Policy Guard / Circuit A remain authoritative; this only shapes client requests.
 */

export type ScannerMissionMode = "fictif" | "real";

export const DEFAULT_REAL_TARGET = "pragma-serve.com";

/** Platform RoE apexes — mirrors packages/policy-guard roe-allowlist (not any URL). */
export const ROE_SCOPE_LABEL =
  "*.pragma-serve.com, *.pragma-cloud.com, *.pragma.mc";

export const TEST_RESPONSIBILITY_LABEL =
  "Je me déclare responsable des tests sur les domaines Pragma autorisés (RoE).";

export type RealMissionInput = {
  signatureEnvelopeId: string;
  targetHost: string;
  /** Required gate before Sign attach / scan — operator acknowledges responsibility. */
  testResponsibilityAccepted: boolean;
};

export type RealMissionValidation =
  | {
      ok: true;
      envelopeId: string;
      targetHost: string;
      testResponsibilityAccepted: true;
    }
  | { ok: false; reason: string };

/** Validate responsibility ack + Sign envelope id + in-scope target before POST. */
export function validateRealMissionInput(
  input: RealMissionInput,
): RealMissionValidation {
  if (!input.testResponsibilityAccepted) {
    return {
      ok: false,
      reason:
        "Cochez « se déclarer responsable des tests » avant Sign / scan (RoE Pragma).",
    };
  }
  const envelopeId = input.signatureEnvelopeId.trim();
  const targetHost = input.targetHost.trim().toLowerCase().replace(/\.$/, "");
  if (!envelopeId || envelopeId.length < 1) {
    return {
      ok: false,
      reason:
        "signatureEnvelopeId requis (enveloppe Pragma Sign déjà signée).",
    };
  }
  if (!targetHost || targetHost.length < 3) {
    return {
      ok: false,
      reason: `Cible FQDN requise dans le RoE (${ROE_SCOPE_LABEL}).`,
    };
  }
  return {
    ok: true,
    envelopeId,
    targetHost,
    testResponsibilityAccepted: true,
  };
}

export function createMissionBody(args: {
  mode: ScannerMissionMode;
  assetId: string;
  uxNeedId: string;
}): Record<string, unknown> {
  if (args.mode === "fictif") {
    return {
      title: "[FICTIF] Mission présence web",
      uxNeedIds: [args.uxNeedId],
      assetIds: [args.assetId],
      synthetic: true,
      exclusions: ["mail.example.com"],
      notes: "RoE démo — exclusions machine-readable",
    };
  }
  return {
    title: "Mission présence web (réelle)",
    uxNeedIds: [args.uxNeedId],
    assetIds: [args.assetId],
    synthetic: false,
    exclusions: [],
    notes: "RoE réel — owner-auth via Sign attach ; Circuit A requis",
  };
}

/** Operator-facing message after Sign attach (before Circuit A). */
export function circuitAPendingMessage(missionId: string, status: string): string {
  return (
    `Mission ${missionId} → ${status}. Enveloppe Sign attachée. ` +
    `Circuit A encore requis : un approbateur staff doit décider dans l’admin ` +
    `(POST /v1/admin/approvals/:id/decide). Puis « Exécuter » ici — Policy Guard inchangé.`
  );
}

export function canClientExecute(status: string): boolean {
  return status === "A_APPROVED" || status === "A_SKIPPED_DEMO";
}
