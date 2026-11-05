/**
 * Scanner CTA path selection — FICTIF (demo) vs real (Paradise attach).
 * Policy Guard / Circuit A remain authoritative; this only shapes client requests.
 */

export type ScannerMissionMode = "fictif" | "real";

export const DEFAULT_REAL_TARGET = "pragma-serve.com";

export type RealMissionInput = {
  paradiseAttestation: string;
  targetHost: string;
};

export type RealMissionValidation =
  | { ok: true; attestation: string; targetHost: string }
  | { ok: false; reason: string };

/** Validate operator-provided Paradise attestation + in-scope target before POST. */
export function validateRealMissionInput(
  input: RealMissionInput,
): RealMissionValidation {
  const attestation = input.paradiseAttestation.trim();
  const targetHost = input.targetHost.trim().toLowerCase().replace(/\.$/, "");
  if (!attestation || attestation.length < 8) {
    return {
      ok: false,
      reason:
        "Attestation Paradise requise (coller le jeton HMAC compact, ≥ 8 caractères).",
    };
  }
  if (!targetHost || targetHost.length < 3) {
    return {
      ok: false,
      reason: "Cible FQDN requise (ex. pragma-serve.com, in-scope RoE).",
    };
  }
  return { ok: true, attestation, targetHost };
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
    notes: "RoE réel — owner-auth via Paradise attach ; Circuit A requis",
  };
}

/** Operator-facing message after paradise attach (before Circuit A). */
export function circuitAPendingMessage(missionId: string, status: string): string {
  return (
    `Mission ${missionId} → ${status}. Attestation Paradise attachée. ` +
    `Circuit A encore requis : un approbateur staff doit décider dans l’admin ` +
    `(POST /v1/admin/approvals/:id/decide). Puis « Exécuter » ici — Policy Guard inchangé.`
  );
}

export function canClientExecute(status: string): boolean {
  return status === "A_APPROVED" || status === "A_SKIPPED_DEMO";
}
