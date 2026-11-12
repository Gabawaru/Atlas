/**
 * C1 — confirmation locale avant prise en charge (thin slice PC-initiated).
 *
 * D5 ATLAS_API_BASE manquant → pas de phone→PC. Fail-closed : doute = phone
 * → message bloquant, aucun egress / soft twin faux.
 *
 * Pages soft twin (atlas-secu-pages) : hors monorepo — follow-up C1 + /test status.
 */

export type SupportHandoffGateResult =
  | { ok: true; pcConfirmedAt: string }
  | {
      ok: false;
      code: "phone_blocked" | "cancelled";
      message: string;
    };

/** UA / coarse hints — never used to *grant* handoff, only to require extra care. */
const PHONE_UA_RE =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i;

export const SUPPORT_HANDOFF_C1_PROMPT =
  "Remettre cette sélection à Atlas / Pragma pour prise en charge ? Rien ne sera envoyé si vous annulez.";

export const SUPPORT_HANDOFF_PHONE_BLOCK_MSG =
  "Prise en charge depuis un téléphone : confirmation PC requise. ATLAS_API_BASE n’est pas branché pour le pont phone→PC — ouvrez Atlas sur le PC local pour confirmer (C1). Aucun soft twin téléphone.";

/**
 * Fail-closed device class: missing / empty UA or phone-like → treat as phone.
 */
export function isPhoneLikeDevice(userAgent?: string | null): boolean {
  const ua = (userAgent ?? "").trim();
  if (!ua) return true;
  return PHONE_UA_RE.test(ua);
}

/**
 * Gate before any handoff egress. PC → window.confirm (injectable). Phone → block.
 */
export function gateSupportHandoffC1(args?: {
  userAgent?: string | null;
  confirmFn?: (message: string) => boolean;
  now?: () => string;
}): SupportHandoffGateResult {
  const ua =
    args?.userAgent !== undefined
      ? args.userAgent
      : typeof navigator !== "undefined"
        ? navigator.userAgent
        : "";
  if (isPhoneLikeDevice(ua)) {
    return {
      ok: false,
      code: "phone_blocked",
      message: SUPPORT_HANDOFF_PHONE_BLOCK_MSG,
    };
  }
  const confirmFn =
    args?.confirmFn ??
    ((message: string) =>
      typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm(message)
        : false);
  if (!confirmFn(SUPPORT_HANDOFF_C1_PROMPT)) {
    return {
      ok: false,
      code: "cancelled",
      message: "Prise en charge annulée — rien n’a été transmis.",
    };
  }
  const pcConfirmedAt = args?.now?.() ?? new Date().toISOString();
  return { ok: true, pcConfirmedAt };
}
