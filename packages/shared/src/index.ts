/** Types et constantes partagés Atlas MVP */

export const MODULE_WEB_PASSIVE = "web.passive.presence.v1" as const;

export type ModuleId = typeof MODULE_WEB_PASSIVE | string;

/** Rôles staff entreprise A — séparés, non confondus avec abonnement */
export type StaffRole = "admin" | "support" | "billing" | "ops" | "approver";

/** Rôles côté tenant client */
export type TenantRole = "owner" | "operator" | "viewer";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";

/**
 * Machine d'états mission (parcours-client-admin.md).
 * Transitions interdites testées côté API.
 */
export type MissionStatus =
  | "DRAFT"
  | "ASSETS_LINKED"
  | "PREP_READY"
  | "AUTH_PENDING"
  | "AUTH_VALID"
  | "A_APPROVAL_PENDING"
  | "A_APPROVED"
  | "A_SKIPPED_DEMO"
  | "QUEUED"
  | "RUNNING"
  | "PAUSED"
  | "CANCELLING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "BLOCKED"
  | "REPORT_AVAILABLE"
  | "REMEDIATION_TRACKING"
  | "CLOSED";

export const MISSION_TRANSITIONS: Record<MissionStatus, MissionStatus[]> = {
  DRAFT: ["ASSETS_LINKED", "BLOCKED", "CANCELLED"],
  ASSETS_LINKED: ["PREP_READY", "DRAFT", "BLOCKED", "CANCELLED"],
  PREP_READY: ["AUTH_PENDING", "ASSETS_LINKED", "BLOCKED", "CANCELLED"],
  AUTH_PENDING: ["AUTH_VALID", "PREP_READY", "BLOCKED", "CANCELLED"],
  AUTH_VALID: [
    "A_APPROVAL_PENDING",
    "A_SKIPPED_DEMO",
    "BLOCKED",
    "CANCELLED",
  ],
  A_APPROVAL_PENDING: ["A_APPROVED", "BLOCKED", "AUTH_VALID", "CANCELLED"],
  A_APPROVED: ["QUEUED", "BLOCKED", "CANCELLED"],
  A_SKIPPED_DEMO: ["QUEUED", "BLOCKED", "CANCELLED"],
  QUEUED: ["RUNNING", "CANCELLING", "BLOCKED", "CANCELLED"],
  RUNNING: ["PAUSED", "CANCELLING", "COMPLETED", "FAILED", "CANCELLED"],
  PAUSED: ["RUNNING", "CANCELLING", "CANCELLED"],
  CANCELLING: ["CANCELLED"],
  COMPLETED: ["REPORT_AVAILABLE"],
  FAILED: ["REPORT_AVAILABLE", "CLOSED"],
  CANCELLED: ["CLOSED"],
  BLOCKED: ["AUTH_VALID", "A_APPROVAL_PENDING", "CLOSED", "CANCELLED"],
  REPORT_AVAILABLE: ["REMEDIATION_TRACKING", "CLOSED"],
  REMEDIATION_TRACKING: ["CLOSED"],
  CLOSED: [],
};

export function canTransition(
  from: MissionStatus,
  to: MissionStatus,
): boolean {
  return MISSION_TRANSITIONS[from]?.includes(to) ?? false;
}

export type PolicyDecision = "ALLOW" | "REJECT";

export type PolicyRejectCode =
  | "SUBSCRIPTION_INACTIVE"
  | "ENTITLEMENT_MISSING"
  | "OWNER_AUTH_INVALID"
  | "OWNER_AUTH_MISSING"
  | "APPROVAL_MISSING"
  | "APPROVAL_INVALID"
  | "NO_APPROVAL_ROUTE"
  | "SCOPE_MISMATCH"
  | "SCOPE_REVOKED"
  | "PERIOD_OUTSIDE"
  | "TOKEN_MISSING"
  | "TOKEN_REVOKED"
  | "TOKEN_EXPIRED"
  | "MODULE_NOT_IN_TOKEN"
  | "MODULE_OUT_OF_SCOPE"
  | "TARGET_OUT_OF_SCOPE"
  | "POLICY_DENY"
  | "SYNTHETIC_ONLY";

export interface PolicyEvaluationInput {
  now: Date;
  moduleId: string;
  claimedScopeHash: string;
  subscriptionActive: boolean;
  entitlementAllowsModule: boolean;
  ownerAuthorizationValid: boolean;
  ownerAuthorizationScopeHash: string | null;
  approvalApproved: boolean;
  approvalScopeHash: string | null;
  approvalRouteConfigured: boolean;
  /** Mission réelle (pas démo synthétique) */
  isRealMission: boolean;
  /** Démo synthétique autorisée sans approbateur A */
  isSyntheticDemo: boolean;
  periodStart: Date;
  periodEnd: Date;
  tokenPresent: boolean;
  tokenRevoked: boolean;
  tokenExpiresAt: Date | null;
  tokenScopeHash: string | null;
  tokenModuleIds: string[];
  scopeRevoked: boolean;
  targetInApprovedScope: boolean;
  killSwitch?: boolean;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  code?: PolicyRejectCode;
  reason: string;
}

export const UX_NEEDS = [
  {
    id: "web_presence",
    label: "Analyser la présence web",
    description: "Comprendre l'exposition internet (sites, DNS, surface publique).",
    moduleIds: [MODULE_WEB_PASSIVE],
    mvpReady: true,
  },
  {
    id: "internal_network",
    label: "Évaluer le réseau interne",
    description: "Cartographier le réseau privé sous autorisation.",
    moduleIds: [],
    mvpReady: false,
  },
  {
    id: "systems_software",
    label: "Vérifier systèmes et logiciels",
    description: "Versions, patchs, logiciels vulnérables.",
    moduleIds: [],
    mvpReady: false,
  },
  {
    id: "configs_access",
    label: "Contrôler configs et accès",
    description: "Durcissement, comptes, permissions.",
    moduleIds: [],
    mvpReady: false,
  },
  {
    id: "vuln_tracking",
    label: "Suivre et corriger les vulnérabilités",
    description: "Prioriser, assigner, retester, clôturer.",
    moduleIds: [],
    mvpReady: false,
  },
] as const;

export type UxNeedId = (typeof UX_NEEDS)[number]["id"];
