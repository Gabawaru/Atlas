/**
 * Policy Guard — contrôles déterministes pré-exécution.
 * Aucun appel LLM. L'IA ne peut pas s'auto-accorder de droits.
 *
 * Rappels :
 * - Abonnement ≠ autorisation pentest
 * - Approbation A ≠ autorisation propriétaire
 */
import type {
  PolicyEvaluationInput,
  PolicyEvaluationResult,
} from "@atlas/shared";

export type { PolicyEvaluationInput, PolicyEvaluationResult };

function reject(
  code: NonNullable<PolicyEvaluationResult["code"]>,
  reason: string,
): PolicyEvaluationResult {
  return { decision: "REJECT", code, reason };
}

/**
 * Évalue si une exécution de module est autorisée.
 * Ordre des contrôles documenté — reproductible, sans LLM.
 */
export function evaluateExecution(
  input: PolicyEvaluationInput,
): PolicyEvaluationResult {
  if (input.killSwitch) {
    return reject("POLICY_DENY", "Kill-switch ops actif.");
  }

  // Abonnement = droit logiciel uniquement ; nécessaire mais insuffisant
  if (!input.subscriptionActive) {
    return reject(
      "SUBSCRIPTION_INACTIVE",
      "Abonnement inactif — accès produit uniquement, pas d'exécution.",
    );
  }

  if (!input.entitlementAllowsModule) {
    return reject(
      "ENTITLEMENT_MISSING",
      "Module non inclus dans l'offre produit (entitlement).",
    );
  }

  if (input.scopeRevoked) {
    return reject(
      "SCOPE_REVOKED",
      "Périmètre révoqué ou remplacé par une nouvelle version.",
    );
  }

  if (
    input.now < input.periodStart ||
    input.now > input.periodEnd
  ) {
    return reject(
      "PERIOD_OUTSIDE",
      "Hors fenêtre d'autorisation du périmètre.",
    );
  }

  if (!input.ownerAuthorizationValid) {
    return reject(
      "OWNER_AUTH_MISSING",
      "Autorisation propriétaire manquante ou invalide.",
    );
  }

  if (
    !input.ownerAuthorizationScopeHash ||
    input.ownerAuthorizationScopeHash !== input.claimedScopeHash
  ) {
    return reject(
      "OWNER_AUTH_INVALID",
      "Autorisation propriétaire non liée à ce scope_hash.",
    );
  }

  // Mission réelle : circuit A obligatoire et routé
  if (input.isRealMission) {
    if (!input.approvalRouteConfigured) {
      return reject(
        "NO_APPROVAL_ROUTE",
        "Aucun approbateur A configuré — mission réelle bloquée (pas de fallback inventé).",
      );
    }
    if (!input.approvalApproved) {
      return reject(
        "APPROVAL_MISSING",
        "Approbation entreprise A manquante — distincte de l'autorisation propriétaire.",
      );
    }
    if (
      !input.approvalScopeHash ||
      input.approvalScopeHash !== input.claimedScopeHash
    ) {
      return reject(
        "APPROVAL_INVALID",
        "Approbation A non applicable à ce scope_hash.",
      );
    }
  } else if (!input.isSyntheticDemo) {
    return reject(
      "SYNTHETIC_ONLY",
      "Mode non synthétique sans marqueur démo — refus.",
    );
  }

  if (!input.tokenPresent) {
    return reject("TOKEN_MISSING", "Jeton d'exécution absent.");
  }

  if (input.tokenRevoked) {
    return reject("TOKEN_REVOKED", "Jeton d'exécution révoqué.");
  }

  if (
    !input.tokenExpiresAt ||
    input.now > input.tokenExpiresAt
  ) {
    return reject("TOKEN_EXPIRED", "Jeton d'exécution expiré.");
  }

  if (
    !input.tokenScopeHash ||
    input.tokenScopeHash !== input.claimedScopeHash
  ) {
    return reject(
      "SCOPE_MISMATCH",
      "scope_hash demandé ≠ scope_hash du jeton.",
    );
  }

  if (!input.tokenModuleIds.includes(input.moduleId)) {
    return reject(
      "MODULE_NOT_IN_TOKEN",
      "Module hors liste autorisée du jeton.",
    );
  }

  if (!input.targetInApprovedScope) {
    return reject(
      "TARGET_OUT_OF_SCOPE",
      "Cible hors périmètre approuvé — jamais d'exécution hors scope.",
    );
  }

  return {
    decision: "ALLOW",
    reason: "Tous les garde-fous déterministes sont satisfaits.",
  };
}

/** Helpers de test / seeds — hash canonique simple (MVP) */
export function canonicalizeScopePayload(payload: unknown): string {
  return JSON.stringify(sortKeys(payload));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeys(obj[key]);
    }
    return sorted;
  }
  return value;
}

export async function hashScope(payload: unknown): Promise<string> {
  const { createHash } = await import("node:crypto");
  const canonical = canonicalizeScopePayload(payload);
  return createHash("sha256").update(canonical).digest("hex");
}
