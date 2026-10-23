/** Types et constantes partagés Atlas MVP */

/** Modes de déploiement — mêmes contrats API (ADR-009) */
export const DEPLOY_MODES = ["hosted", "hybrid", "local"] as const;
export type DeployMode = (typeof DEPLOY_MODES)[number];

export const MODULE_WEB_PASSIVE = "web.passive.presence.v1" as const;

export type ModuleId = typeof MODULE_WEB_PASSIVE | string;

/** Méthodes passives autorisables dans un RoE (pas de scan agressif) */
export const PASSIVE_ROE_METHODS = [
  "dns.lookup",
  "dns.records",
  "tls.certificate",
  "http.headers",
  "http.presence",
] as const;

export type PassiveRoeMethod = (typeof PASSIVE_ROE_METHODS)[number];

/** RoE machine-readable lié à une ScopeVersion */
export interface MachineReadableRoe {
  version: number;
  scopeHash: string;
  assetIds: string[];
  /** FQDN / hôtes exclus (refus déterministe même si sous-domaine du scope) */
  exclusions: string[];
  methods: string[];
  periodStart: string;
  periodEnd: string;
  notes?: string | null;
  revoked: boolean;
}

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
  | "CONNECTOR_MISSING"
  | "CONNECTOR_REVOKED"
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
  /** Connecteur requis pour le module (ex. présence web) */
  connectorRequired?: boolean;
  connectorPresent?: boolean;
  connectorActive?: boolean;
  killSwitch?: boolean;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  code?: PolicyRejectCode;
  reason: string;
}

/** État UX honnête — jamais « terminé » si non branché */
export type UxNeedStatus = "usable" | "not_wired" | "coming_soon";

export const UX_NEEDS = [
  {
    id: "web_presence",
    label: "Analyser la présence web",
    description: "Comprendre l'exposition internet (sites, DNS, surface publique).",
    moduleIds: [MODULE_WEB_PASSIVE],
    connectorIds: ["web.passive.presence"],
    mvpReady: true,
    status: "usable" as UxNeedStatus,
    statusLabel: "Utilisable — présence web passive",
  },
  {
    id: "internal_network",
    label: "Évaluer le réseau interne",
    description: "Cartographier le réseau privé sous autorisation.",
    moduleIds: [] as string[],
    connectorIds: [] as string[],
    mvpReady: false,
    status: "not_wired" as UxNeedStatus,
    statusLabel: "Non branché — aucun module réseau MVP",
  },
  {
    id: "systems_software",
    label: "Vérifier systèmes et logiciels",
    description: "Versions, patchs, logiciels vulnérables.",
    moduleIds: ["vuln.match.passive.v1"] as string[],
    connectorIds: ["github.read_only"],
    mvpReady: false,
    status: "coming_soon" as UxNeedStatus,
    statusLabel:
      "Partiel — inventaire seed + matching OSV/NVD/KEV passif (pas de scan agressif)",
  },
  {
    id: "configs_access",
    label: "Contrôler configs et accès",
    description: "Durcissement, comptes, permissions.",
    moduleIds: [] as string[],
    connectorIds: [] as string[],
    mvpReady: false,
    status: "not_wired" as UxNeedStatus,
    statusLabel: "Non branché — pas de connecteur IAM/config",
  },
  {
    id: "vuln_tracking",
    label: "Suivre et corriger les vulnérabilités",
    description: "Prioriser, assigner, retester, clôturer.",
    moduleIds: ["vuln.match.passive.v1"] as string[],
    connectorIds: [] as string[],
    mvpReady: false,
    status: "coming_soon" as UxNeedStatus,
    statusLabel:
      "Partiel — findings CVE avec confiance ≠ gravité + remédiation locale",
  },
] as const;

export type UxNeedId = (typeof UX_NEEDS)[number]["id"];

export const CONNECTOR_WEB_PASSIVE = "web.passive.presence" as const;
export const CONNECTOR_GITHUB_RO = "github.read_only" as const;
