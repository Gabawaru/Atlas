/**
 * Public support handoff status — Pages /test + client observability.
 * No PII. Phone→PC remains blocked until ATLAS_API_BASE.
 */

export type SupportHandoffPublicStatus = {
  handoff: "none" | "awaiting_confirm" | "active";
  c1Required: true;
  phoneToPc: "blocked_until_ATLAS_API_BASE";
  supportSessionId?: string;
  handoffIntentId?: string;
  requestedAt?: string;
  expiresAt?: string;
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

export function publicStatusAwaitingConfirm(input: {
  handoffIntentId: string;
  createdAt: string;
  expiresAt: string;
}): SupportHandoffPublicStatus {
  return {
    handoff: "awaiting_confirm",
    c1Required: true,
    phoneToPc: "blocked_until_ATLAS_API_BASE",
    handoffIntentId: input.handoffIntentId,
    requestedAt: input.createdAt,
    expiresAt: input.expiresAt,
  };
}

export function publicStatusActive(input: {
  supportSessionId: string;
  requestedAt: string;
  ticketCount: number;
  vulnCount: number;
  progressCount: number;
  handoffIntentId?: string;
}): SupportHandoffPublicStatus {
  return {
    handoff: "active",
    c1Required: true,
    phoneToPc: "blocked_until_ATLAS_API_BASE",
    supportSessionId: input.supportSessionId,
    handoffIntentId: input.handoffIntentId,
    requestedAt: input.requestedAt,
    ticketCount: input.ticketCount,
    vulnCount: input.vulnCount,
    progressCount: input.progressCount,
  };
}
