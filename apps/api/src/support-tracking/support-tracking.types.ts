/**
 * Opaque support-session soft twin — no email / name / login session fields.
 * Multi-device key = supportSessionId only (after prise en charge).
 */

export type SupportTicketRow = {
  id: string;
  subject: string;
  status: string;
  updatedAt: string;
};

export type SupportVulnRow = {
  id: string;
  title: string;
  risk: string;
  ticketId: string;
  status: string;
  fingerprint?: string;
};

export type SupportProgressRow = {
  ticketId: string;
  label: string;
  pct: number;
  note: string;
  updatedAt: string;
};

export type SupportSessionRecord = {
  supportSessionId: string;
  requestedAt: string;
  source: string;
  /** Optional link to SAV ticket when authenticated handoff created one */
  ticketId?: string;
  tenantId?: string;
  tickets: SupportTicketRow[];
  vulns: SupportVulnRow[];
  progress: SupportProgressRow[];
};

export type SupportSessionSnapshot = {
  supportSessionId: string;
  requestedAt: string;
  ticketId?: string;
  tickets: SupportTicketRow[];
  vulns: SupportVulnRow[];
  progress: SupportProgressRow[];
};

export function toSnapshot(rec: SupportSessionRecord): SupportSessionSnapshot {
  return {
    supportSessionId: rec.supportSessionId,
    requestedAt: rec.requestedAt,
    ticketId: rec.ticketId,
    tickets: rec.tickets,
    vulns: rec.vulns,
    progress: rec.progress,
  };
}

export function isSupportSessionRecord(
  value: unknown,
): value is SupportSessionRecord {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.supportSessionId === "string" &&
    typeof v.requestedAt === "string" &&
    Array.isArray(v.tickets) &&
    Array.isArray(v.vulns) &&
    Array.isArray(v.progress)
  );
}
