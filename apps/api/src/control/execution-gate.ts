/**
 * Policy Guard input assembly for enqueue + worker re-gate.
 * Deterministic; no LLM. Worker must not trust enqueue-time ALLOW alone.
 */
import { evaluateExecution } from "@atlas/policy-guard";
import {
  isSubscriptionCommerciallyActive,
  type PolicyEvaluationInput,
  type PolicyEvaluationResult,
} from "@atlas/shared";
import { WEB_PASSIVE_MODULE_ID } from "./web-passive";

export type GateMissionSlice = {
  id: string;
  tenantId: string;
  synthetic: boolean;
  isRealMission: boolean;
  moduleIds: string[];
  scopeVersions: Array<{
    scopeHash: string;
    assetIds: string[];
    exclusions: string[];
    periodStart: Date;
    periodEnd: Date;
    revokedAt: Date | null;
  }>;
  tokens: Array<{
    id: string;
    scopeHash: string;
    moduleIds: string[];
    expiresAt: Date;
    revokedAt: Date | null;
  }>;
  ownerAuths: Array<{
    status: string;
    scopeHash: string;
  }>;
  approvalReqs: Array<{
    decisions: Array<{
      decision: string;
      scopeHash: string;
    }>;
  }>;
};

export type ConnectorGuardState = {
  connectorRequired: boolean;
  connectorPresent: boolean;
  connectorActive: boolean;
};

export function buildExecutionGateInput(args: {
  mission: GateMissionSlice;
  now?: Date;
  subscription: {
    status: string;
    endsAt?: Date | string | null;
    plan: { modulesEntitled: string[] };
  } | null;
  approvalRouteConfigured: boolean;
  assetsCount: number;
  connectorGuard: ConnectorGuardState;
  killSwitch: boolean;
  moduleId?: string;
}): PolicyEvaluationInput {
  const now = args.now ?? new Date();
  const moduleId = args.moduleId ?? WEB_PASSIVE_MODULE_ID;
  const mission = args.mission;
  const scope = mission.scopeVersions[0];
  const token = mission.tokens.find((t) => !t.revokedAt) ?? mission.tokens[0];
  const owner = mission.ownerAuths.find((o) => o.status === "valid");
  const approval = mission.approvalReqs
    .flatMap((r) => r.decisions)
    .find((d) => d.decision === "approved");
  const sub = args.subscription;

  return {
    now,
    moduleId,
    claimedScopeHash: scope?.scopeHash ?? "",
    subscriptionActive: sub
      ? isSubscriptionCommerciallyActive(sub, now)
      : false,
    entitlementAllowsModule:
      sub?.plan.modulesEntitled.includes(moduleId) ?? false,
    ownerAuthorizationValid: owner?.status === "valid",
    ownerAuthorizationScopeHash: owner?.scopeHash ?? null,
    approvalApproved: mission.synthetic
      ? true
      : approval?.decision === "approved",
    approvalScopeHash: mission.synthetic
      ? (scope?.scopeHash ?? null)
      : (approval?.scopeHash ?? null),
    approvalRouteConfigured: mission.synthetic
      ? true
      : args.approvalRouteConfigured,
    isRealMission: mission.isRealMission,
    isSyntheticDemo: mission.synthetic,
    periodStart: scope?.periodStart ?? new Date(0),
    periodEnd: scope?.periodEnd ?? new Date(0),
    tokenPresent: !!token && !token.revokedAt,
    tokenRevoked: !!token?.revokedAt,
    tokenExpiresAt: token?.expiresAt ?? null,
    tokenScopeHash: token?.scopeHash ?? null,
    tokenModuleIds: token?.moduleIds ?? [],
    scopeRevoked: !!scope?.revokedAt,
    targetInApprovedScope: args.assetsCount > 0,
    connectorRequired: args.connectorGuard.connectorRequired,
    connectorPresent: args.connectorGuard.connectorPresent,
    connectorActive: args.connectorGuard.connectorActive,
    killSwitch: args.killSwitch,
  };
}

export function evaluateMissionExecution(
  args: Parameters<typeof buildExecutionGateInput>[0],
): PolicyEvaluationResult {
  return evaluateExecution(buildExecutionGateInput(args));
}
