/**
 * Glossaire commercial Atlas — distinct de l'autorisation de test.
 *
 * - Plan / Subscription = droit d'utiliser le logiciel (licence)
 * - OwnerAuthorization / RoE / Token / Approval A = autorisation d'exécuter
 *
 * Règle dure : abonnement actif ≠ autorisation pentest.
 */

export const BILLING_PRINCIPLE =
  "Abonnement = droit logiciel commercial. Autorisation de test = RoE + co-signature + Policy Guard. Un abonnement actif n'autorise jamais seul un contrôle.";

export const BILLING_DISCLAIMER =
  "Stub paiement uniquement (provider=stub). Aucun PSP réel (Stripe/Adyen…). Hors chemin Policy Guard — un paiement simulé ne crée jamais une autorisation pentest.";

/** Champs commerciaux exposables au rôle billing — jamais RoE, jetons, findings, preuves. */
export const BILLING_SAFE_FIELDS = [
  "tenantId",
  "tenantSlug",
  "tenantName",
  "planCode",
  "planName",
  "modulesEntitled",
  "maxUsers",
  "llmTokenCapMonthly",
  "llmEuroCapCentsMonthly",
  "status",
  "startsAt",
  "endsAt",
  "commerciallyActive",
] as const;
