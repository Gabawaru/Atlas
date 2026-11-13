/**
 * Pure risk-table helpers shared by API + client (atl-retours DRY slice 1).
 * Full buildPresenceRiskTable still mirrored; helpers live here to stop drift.
 */

/** 180 j — plancher Mozilla ; pas d'exigence preload. */
export const HSTS_MAX_AGE_FLOOR_SEC = 15_552_000;

/** Parse max-age=N depuis Strict-Transport-Security (null si absent / invalide). */
export function parseHstsMaxAge(hsts: string | undefined | null): number | null {
  if (!hsts?.trim()) return null;
  const m = /(?:^|;)\s*max-age\s*=\s*(\d+)/i.exec(hsts);
  if (!m) return null;
  return Number(m[1]);
}

/** HSTS présent mais max-age manquant ou sous plancher (absence → missing[]). */
export function isHstsMaxAgeWeak(hsts: string | undefined | null): boolean {
  if (!hsts?.trim()) return false;
  const age = parseHstsMaxAge(hsts);
  if (age === null) return true;
  return age < HSTS_MAX_AGE_FLOOR_SEC;
}

export type RdapOsintLike = {
  ok?: boolean;
  error?: string;
  source?: string;
  registrar?: string;
  events?: Array<{ action?: string; date?: string }>;
};

/** RDAP expiration event date (ISO), if any. */
export function rdapExpiryIso(
  osint: RdapOsintLike | undefined | null,
): string | null {
  if (!osint?.ok) return null;
  const exp = (osint.events ?? []).find((e) =>
    /expir/i.test(e.action ?? ""),
  );
  const raw = exp?.date?.trim();
  if (!raw) return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

/** Days until RDAP expiry (negative if past); null if unknown. */
export function rdapExpiryDaysRemaining(
  osint: RdapOsintLike | undefined | null,
  nowMs: number = Date.now(),
): number | null {
  const iso = rdapExpiryIso(osint);
  if (!iso) return null;
  const t = Date.parse(iso);
  return Math.floor((t - nowMs) / 86_400_000);
}

/** RDAP signal — registrar + expiry when present. */
export function formatRdapSignal(osint: RdapOsintLike): string {
  if (!osint.ok) return osint.error ?? "échec";
  const parts: string[] = [osint.source ?? "rdap"];
  const registrar = osint.registrar?.trim();
  if (registrar) parts.push(registrar);
  const day = rdapExpiryIso(osint)?.slice(0, 10);
  if (day) parts.push(`expiry=${day}`);
  return parts.join(" · ");
}

/** Apex TXT SPF presence. */
export function hasSpfInTxtSample(txtSample: string[] | undefined): boolean {
  if (!Array.isArray(txtSample) || txtSample.length === 0) return false;
  return txtSample.some((t) => /\bv=spf1\b/i.test(t));
}

/** Apex TXT DMARC presence (`v=DMARC1`) — no `_dmarc.` enum, sample only. */
export function hasDmarcInTxtSample(txtSample: string[] | undefined): boolean {
  if (!Array.isArray(txtSample) || txtSample.length === 0) return false;
  return txtSample.some((t) => /\bv=DMARC1\b/i.test(t));
}
