/**
 * Policy Guard — contrôles déterministes pré-exécution.
 * Aucun appel LLM. L'IA ne peut pas s'auto-accorder de droits.
 *
 * Rappels :
 * - Abonnement ≠ autorisation pentest
 * - Approbation A ≠ autorisation propriétaire
 * - Signature mock/stub ≠ autorisation signée (Pragma Sign) pour mission réelle
 */
import type {
  PolicyEvaluationInput,
  PolicyEvaluationResult,
} from "@atlas/shared";
import { MODULE_WEB_PASSIVE } from "@atlas/shared";

export type { PolicyEvaluationInput, PolicyEvaluationResult };

function reject(
  code: NonNullable<PolicyEvaluationResult["code"]>,
  reason: string,
): PolicyEvaluationResult {
  return { decision: "REJECT", code, reason };
}

/**
 * ATLAS_AUTHZ=signed — attestation locale/dev uniquement (sans PRAGMA_SIGN_API_KEY).
 * Prod : préférer poll Pragma Sign (voir resolveSignedAuthzAttested côté API).
 */
export function isSignedAuthzAttested(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return env.ATLAS_AUTHZ === "signed";
}

/** Modules agressifs / non-MVP — refusés sans authz signée. */
export function isAggressiveModule(moduleId: string): boolean {
  if (moduleId === MODULE_WEB_PASSIVE) return false;
  return /aggressive|exploit|active\.scan|bruteforce|fuzz\.active/i.test(
    moduleId,
  );
}

/**
 * Évalue si une exécution de module est autorisée.
 * Ordre des contrôles documenté — reproductible, sans LLM.
 */
export function evaluateExecution(
  input: PolicyEvaluationInput,
): PolicyEvaluationResult {
  if (input.killSwitch) {
    return reject(
      "POLICY_DENY",
      "Mode maintenance / kill-switch ops actif — exécution bloquée.",
    );
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

  // Fail-closed : stub absent ⇒ stub ; attestation absente ⇒ non signée
  const ownerIsStub = input.ownerAuthorizationIsStub !== false;
  const authzAttested = input.signedAuthzAttested === true;

  // Mission réelle : mock ≠ Pragma Sign sauf attestation (poll Sign ou ATLAS_AUTHZ local)
  if (input.isRealMission && ownerIsStub && !authzAttested) {
    return reject(
      "OWNER_AUTH_STUB",
      "Autorisation stub/mock — mission réelle refusée sans enveloppe Pragma Sign signée (ou ATLAS_AUTHZ=signed en local).",
    );
  }

  // Pack agressif : même règle signed-authz (démo synthétique ne contourne pas)
  if (isAggressiveModule(input.moduleId) && ownerIsStub && !authzAttested) {
    return reject(
      "MODULE_OUT_OF_SCOPE",
      "Module agressif refusé sans autorisation signée (Pragma Sign / ATLAS_AUTHZ local).",
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

  if (input.connectorRequired) {
    if (!input.connectorPresent) {
      return reject(
        "CONNECTOR_MISSING",
        "Connecteur requis absent — connectez le module avant exécution (hors LLM).",
      );
    }
    if (!input.connectorActive) {
      return reject(
        "CONNECTOR_REVOKED",
        "Connecteur révoqué — permissions coupées, exécution refusée.",
      );
    }
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
