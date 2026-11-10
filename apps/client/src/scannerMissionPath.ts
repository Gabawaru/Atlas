/**
 * Scanner CTA path selection — FICTIF (demo) vs real (liability checkbox).
 * Policy Guard / Circuit A / RoE remain authoritative; this only shapes client requests.
 * No Pragma Sign envelope paste on the real path.
 */

export type ScannerMissionMode = "fictif" | "real";

export const DEFAULT_REAL_TARGET = "pragma-serve.com";

/** Platform RoE apexes — mirrors packages/policy-guard roe-allowlist (not any URL). */
export const ROE_SCOPE_LABEL =
  "*.pragma-serve.com, *.pragma-cloud.com, *.pragma.mc";

/** Exact checkbox / ack label — liability if the scan turns out unauthorized. */
export const TEST_RESPONSIBILITY_LABEL =
  "Je prends la responsabilité de ce scan s'il s'avère non autorisé.";

/**
 * ASCII-safe mission titles (avoid Windows/UI mojibake on "présence" / "réelle").
 */
export const REAL_MISSION_TITLE = "Presence web";
export const FICTIF_MISSION_TITLE = "[FICTIF] Presence web";

export type RealMissionInput = {
  targetHost: string;
  /** Required gate before real scan — operator accepts liability if unauthorized. */
  testResponsibilityAccepted: boolean;
};

export type RealMissionValidation =
  | {
      ok: true;
      targetHost: string;
      testResponsibilityAccepted: true;
    }
  | { ok: false; reason: string };

/** Validate liability ack + in-scope target before POST (no Sign envelope). */
export function validateRealMissionInput(
  input: RealMissionInput,
): RealMissionValidation {
  if (!input.testResponsibilityAccepted) {
    return {
      ok: false,
      reason: `Cochez « ${TEST_RESPONSIBILITY_LABEL} » avant le scan.`,
    };
  }
  const targetHost = input.targetHost.trim().toLowerCase().replace(/\.$/, "");
  if (!targetHost || targetHost.length < 3) {
    return {
      ok: false,
      reason: `Cible FQDN requise (${ROE_SCOPE_LABEL}).`,
    };
  }
  return {
    ok: true,
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
      title: FICTIF_MISSION_TITLE,
      uxNeedIds: [args.uxNeedId],
      assetIds: [args.assetId],
      synthetic: true,
      exclusions: ["mail.example.com"],
      notes: "Demo FICTIF",
    };
  }
  return {
    title: REAL_MISSION_TITLE,
    uxNeedIds: [args.uxNeedId],
    assetIds: [args.assetId],
    synthetic: false,
    exclusions: [],
      notes: "Responsabilite operateur cochee",
  };
}

/** Short status after liability owner-auth when Circuit A still pending. */
export function circuitAPendingMessage(missionId: string, status: string): string {
  return `Mission ${missionId} → ${status}. Circuit A en attente.`;
}

export function canClientExecute(status: string): boolean {
  return status === "A_APPROVED" || status === "A_SKIPPED_DEMO";
}
