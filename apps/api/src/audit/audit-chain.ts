/**
 * Chaîne d'audit append-only — hash déterministe (AC-07).
 * Aucune dépendance LLM. Une « mise à jour » simulée casse la vérification.
 */
import { createHash } from "node:crypto";

export const AUDIT_GENESIS = "GENESIS";

export interface AuditChainRecord {
  id?: string;
  prevHash: string | null;
  hash: string;
  tenantId?: string | null;
  actorId?: string | null;
  action: string;
  objectType?: string | null;
  objectId?: string | null;
  payload?: unknown;
  requestId?: string | null;
}

/** Payload canonique utilisé pour le hash (ordre de clés stable). */
export function canonicalizeAuditPayload(input: {
  prevHash: string;
  tenantId?: string | null;
  actorId?: string | null;
  action: string;
  objectType?: string | null;
  objectId?: string | null;
  payload?: unknown;
  requestId?: string | null;
}): string {
  return JSON.stringify({
    prevHash: input.prevHash,
    tenantId: input.tenantId ?? null,
    actorId: input.actorId ?? null,
    action: input.action,
    objectType: input.objectType ?? null,
    objectId: input.objectId ?? null,
    payload: input.payload ?? null,
    requestId: input.requestId ?? null,
  });
}

export function hashAuditEvent(input: {
  prevHash: string;
  tenantId?: string | null;
  actorId?: string | null;
  action: string;
  objectType?: string | null;
  objectId?: string | null;
  payload?: unknown;
  requestId?: string | null;
}): string {
  return createHash("sha256")
    .update(canonicalizeAuditPayload(input))
    .digest("hex");
}

export interface ChainVerifyResult {
  ok: boolean;
  checked: number;
  brokenAt?: number;
  reason?: string;
}

/**
 * Vérifie prevHash chaîné + recomputation du hash.
 * `events` doit être ordonné chronologiquement (createdAt ASC, id ASC).
 */
export function verifyAuditChain(
  events: AuditChainRecord[],
): ChainVerifyResult {
  let expectedPrev = AUDIT_GENESIS;
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    const prev = e.prevHash ?? AUDIT_GENESIS;
    if (prev !== expectedPrev) {
      return {
        ok: false,
        checked: i,
        brokenAt: i,
        reason: `prevHash mismatch at index ${i}: expected ${expectedPrev}, got ${prev}`,
      };
    }
    const recomputed = hashAuditEvent({
      prevHash: prev,
      tenantId: e.tenantId,
      actorId: e.actorId,
      action: e.action,
      objectType: e.objectType,
      objectId: e.objectId,
      payload: e.payload,
      requestId: e.requestId,
    });
    if (recomputed !== e.hash) {
      return {
        ok: false,
        checked: i,
        brokenAt: i,
        reason: `hash mismatch at index ${i}: content tampered or non-canonical`,
      };
    }
    expectedPrev = e.hash;
  }
  return { ok: true, checked: events.length };
}
