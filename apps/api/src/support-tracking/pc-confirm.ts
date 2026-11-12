import { BadRequestException } from "@nestjs/common";

/** C1 TTL window — aligned with pending intent TTL (15 min). */
export const PC_CONFIRM_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Fail-closed C1: require recent ISO pcConfirmedAt.
 */
export function requirePcConfirmedAt(
  pcConfirmedAt: string | undefined,
  nowMs = Date.now(),
): string {
  const raw = (pcConfirmedAt ?? "").trim();
  if (!raw) {
    throw new BadRequestException(
      "Confirmation locale PC (C1) requise avant prise en charge.",
    );
  }
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) {
    throw new BadRequestException("pcConfirmedAt invalide (ISO requis).");
  }
  if (t > nowMs + 60_000) {
    throw new BadRequestException("pcConfirmedAt dans le futur.");
  }
  if (nowMs - t > PC_CONFIRM_MAX_AGE_MS) {
    throw new BadRequestException(
      "Confirmation C1 expirée — renouvelez la demande sur le PC.",
    );
  }
  return raw;
}
