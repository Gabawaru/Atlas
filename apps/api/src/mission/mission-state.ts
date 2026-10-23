import { canTransition, type MissionStatus } from "@atlas/shared";

export class IllegalMissionTransitionError extends Error {
  constructor(
    public readonly from: MissionStatus,
    public readonly to: MissionStatus,
  ) {
    super(`Transition interdite: ${from} → ${to}`);
    this.name = "IllegalMissionTransitionError";
  }
}

export function assertTransition(from: MissionStatus, to: MissionStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalMissionTransitionError(from, to);
  }
}

/**
 * Décide la prochaine étape après AUTH_VALID.
 * Mission réelle sans route approbateur → BLOCKED.
 * Démo synthétique → A_SKIPPED_DEMO.
 */
export function nextAfterAuthValid(opts: {
  isRealMission: boolean;
  isSyntheticDemo: boolean;
  approvalRouteConfigured: boolean;
}): { status: MissionStatus; blockedReason?: string } {
  if (opts.isRealMission) {
    if (!opts.approvalRouteConfigured) {
      return {
        status: "BLOCKED",
        blockedReason:
          "NO_APPROVAL_ROUTE: aucun approbateur A configuré — mission réelle bloquée. La démo synthétique reste possible.",
      };
    }
    return { status: "A_APPROVAL_PENDING" };
  }
  if (opts.isSyntheticDemo) {
    return { status: "A_SKIPPED_DEMO" };
  }
  return {
    status: "BLOCKED",
    blockedReason: "Mission non synthétique sans circuit A — bloquée.",
  };
}
