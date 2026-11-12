/**
 * Public support handoff status — Pages /test + client observability.
 * No PII. Phone→PC remains blocked until ATLAS_API_BASE.
 */

export type SupportHandoffPublicStatus = {
  handoff: "none" | "active";
  c1Required: true;
  phoneToPc: "blocked_until_ATLAS_API_BASE";
  supportSessionId?: string;
  requestedAt?: string;
  ticketCount?: number;
  vulnCount?: number;
  progressCount?: number;
};

export function publicStatusNone(): SupportHandoffPublicStatus {
  return {
    handoff: "none",
    c1Required: true,
    phoneToPc: "blocked_until_ATLAS_API_BASE",
  };
}

export function publicStatusActive(input: {
  supportSessionId: string;
  requestedAt: string;
  ticketCount: number;
  vulnCount: number;
  progressCount: number;
}): SupportHandoffPublicStatus {
  return {
    handoff: "active",
    c1Required: true,
    phoneToPc: "blocked_until_ATLAS_API_BASE",
    supportSessionId: input.supportSessionId,
    requestedAt: input.requestedAt,
    ticketCount: input.ticketCount,
    vulnCount: input.vulnCount,
    progressCount: input.progressCount,
  };
}
