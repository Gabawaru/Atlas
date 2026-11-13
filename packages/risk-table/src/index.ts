/**
 * Pure risk-table helpers shared by API + client (atl-retours DRY).
 * Full buildPresenceRiskTable still mirrored; helpers + DNS auth specs here.
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

/** Apex TXT DMARC presence (`v=DMARC1`) — sample from `_dmarc.` probe. */
export function hasDmarcInTxtSample(txtSample: string[] | undefined): boolean {
  if (!Array.isArray(txtSample) || txtSample.length === 0) return false;
  return txtSample.some((t) => /\bv=DMARC1\b/i.test(t));
}

/** Apex CAA presence (formatted issue/iodef lines). */
export function hasCaaInSample(caaSample: string[] | undefined): boolean {
  return Array.isArray(caaSample) && caaSample.some((t) => t.trim().length > 0);
}

/** Format one CAA RR for signal (issue / issuewild / iodef). */
export function formatCaaRecord(rec: {
  critical?: boolean;
  issue?: string;
  issuewild?: string;
  iodef?: string;
}): string | null {
  if (rec.issue?.trim()) {
    return `issue${rec.critical ? " critical" : ""} ${rec.issue.trim()}`;
  }
  if (rec.issuewild?.trim()) {
    return `issuewild${rec.critical ? " critical" : ""} ${rec.issuewild.trim()}`;
  }
  if (rec.iodef?.trim()) {
    return `iodef${rec.critical ? " critical" : ""} ${rec.iodef.trim()}`;
  }
  return null;
}

/** Shared control/signal payload for SPF / DMARC / CAA presence rows. */
export type DnsAuthPresenceSpec = {
  control: string;
  riskCode: "info" | "low";
  compromise: string;
  signal: string;
};

/** SPF from apex TXT sample — null if sample missing (legacy skip). */
export function spfPresenceSpec(
  txtSample: string[] | undefined,
): DnsAuthPresenceSpec | null {
  if (!Array.isArray(txtSample)) return null;
  if (hasSpfInTxtSample(txtSample)) {
    const hit = txtSample.find((t) => /\bv=spf1\b/i.test(t)) ?? "v=spf1";
    return {
      control: "DNS — SPF présent",
      riskCode: "info",
      compromise: "Observation — politique d'émission mail publiée (TXT)",
      signal: hit.trim().slice(0, 120),
    };
  }
  return {
    control: "DNS — SPF absent",
    riskCode: "low",
    compromise:
      "Exposition faible — pas d'enregistrement SPF observé sur l'apex",
    signal: `txt=${txtSample.length}`,
  };
}

/** DMARC from `_dmarc.` TXT sample — null if probe missing. */
export function dmarcPresenceSpec(
  dmarcTxtSample: string[] | undefined,
): DnsAuthPresenceSpec | null {
  if (!Array.isArray(dmarcTxtSample)) return null;
  if (hasDmarcInTxtSample(dmarcTxtSample)) {
    const hit =
      dmarcTxtSample.find((t) => /\bv=DMARC1\b/i.test(t)) ?? "v=DMARC1";
    return {
      control: "DNS — DMARC présent",
      riskCode: "info",
      compromise: "Observation — politique DMARC publiée (_dmarc TXT)",
      signal: hit.trim().slice(0, 120),
    };
  }
  return {
    control: "DNS — DMARC absent",
    riskCode: "low",
    compromise:
      "Exposition faible — pas d'enregistrement DMARC observé (_dmarc)",
    signal: `dmarcTxt=${dmarcTxtSample.length}`,
  };
}

/** CAA from apex sample — null if probe missing. */
export function caaPresenceSpec(
  caaSample: string[] | undefined,
): DnsAuthPresenceSpec | null {
  if (!Array.isArray(caaSample)) return null;
  if (hasCaaInSample(caaSample)) {
    return {
      control: "DNS — CAA présent",
      riskCode: "info",
      compromise: "Observation — autorité de certification contrainte (CAA)",
      signal: caaSample
        .filter((s) => s.trim())
        .slice(0, 3)
        .join(" · ")
        .slice(0, 120),
    };
  }
  return {
    control: "DNS — CAA absent",
    riskCode: "low",
    compromise:
      "Exposition faible — pas d'enregistrement CAA observé sur l'apex",
    signal: `caa=${caaSample.length}`,
  };
}
