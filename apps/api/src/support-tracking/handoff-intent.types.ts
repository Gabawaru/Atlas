/**
 * PC-initiated handoff intent (A1 prep). Phone intents refused until D5.
 * Opaque ids only — no email/name.
 */

export type HandoffIntentStatus =
  | "awaiting_confirm"
  | "active"
  | "expired";

export type HandoffIntentRecord = {
  handoffIntentId: string;
  status: HandoffIntentStatus;
  initiatedFrom: "pc";
  source: string;
  createdAt: string;
  expiresAt: string;
  /** Soft ticket seed (no PII) */
  ticket?: { id?: string; subject?: string; status?: string };
  /** Set once on confirm */
  supportSessionId?: string;
  pcConfirmedAt?: string;
};

export type HandoffIntentSnapshot = {
  handoffIntentId: string;
  status: HandoffIntentStatus;
  initiatedFrom: "pc";
  createdAt: string;
  expiresAt: string;
  supportSessionId?: string;
  phoneToPc: "blocked_until_ATLAS_API_BASE";
  c1Required: true;
};

export function toIntentSnapshot(
  rec: HandoffIntentRecord,
): HandoffIntentSnapshot {
  return {
    handoffIntentId: rec.handoffIntentId,
    status: rec.status,
    initiatedFrom: "pc",
    createdAt: rec.createdAt,
    expiresAt: rec.expiresAt,
    supportSessionId: rec.supportSessionId,
    phoneToPc: "blocked_until_ATLAS_API_BASE",
    c1Required: true,
  };
}

export function isHandoffIntentRecord(
  value: unknown,
): value is HandoffIntentRecord {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.handoffIntentId === "string" &&
    typeof v.status === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.expiresAt === "string" &&
    v.initiatedFrom === "pc"
  );
}
