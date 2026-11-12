/**
 * États UI prise en charge (C1 → egress) — client-ready thin slice.
 * Phone→PC (C2) still blocked until ATLAS_API_BASE.
 */

export type SupportHandoffPhase =
  | "idle"
  | "phone_blocked"
  | "cancelled"
  | "sending"
  | "active"
  | "error";

export function phaseFromGateCode(
  code: "phone_blocked" | "cancelled" | string,
): SupportHandoffPhase {
  if (code === "phone_blocked") return "phone_blocked";
  if (code === "cancelled") return "cancelled";
  return "error";
}

export function phaseLabelFr(
  phase: SupportHandoffPhase,
  selectedCount = 0,
): string {
  switch (phase) {
    case "sending":
      return "Envoi…";
    case "active":
      return "Prise en charge active";
    case "phone_blocked":
      return "Bloqué (PC requis)";
    case "cancelled":
      return selectedCount
        ? `Demander une prise en charge (${selectedCount})`
        : "Demander une prise en charge";
    case "error":
      return selectedCount
        ? `Réessayer la prise en charge (${selectedCount})`
        : "Réessayer la prise en charge";
    case "idle":
    default:
      return selectedCount
        ? `Demander une prise en charge (${selectedCount})`
        : "Demander une prise en charge";
  }
}

export function phaseStatusHintFr(phase: SupportHandoffPhase): string | null {
  switch (phase) {
    case "idle":
      return null;
    case "phone_blocked":
      return "État: bloqué téléphone — confirmez sur le PC Atlas.";
    case "cancelled":
      return "État: annulé — rien transmis.";
    case "sending":
      return "État: envoi après C1…";
    case "active":
      return "État: active — session support opaque ouverte.";
    case "error":
      return "État: erreur — rien n’a été marqué pris en charge.";
    default:
      return null;
  }
}
