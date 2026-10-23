/**
 * E2e logique sans Docker : Policy Guard + machine d'états.
 * Le smoke Docker est dans scripts/smoke.ts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateExecution } from "@atlas/policy-guard";
import { canTransition, MODULE_WEB_PASSIVE } from "@atlas/shared";
import { nextAfterAuthValid } from "../../src/mission/mission-state";

describe("e2e logique (sans DB)", () => {
  it("abonnement seul ne permet pas l'exécution", () => {
    const r = evaluateExecution({
      now: new Date("2026-06-15"),
      moduleId: MODULE_WEB_PASSIVE,
      claimedScopeHash: "h",
      subscriptionActive: true,
      entitlementAllowsModule: true,
      ownerAuthorizationValid: false,
      ownerAuthorizationScopeHash: null,
      approvalApproved: false,
      approvalScopeHash: null,
      approvalRouteConfigured: true,
      isRealMission: true,
      isSyntheticDemo: false,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-07-01"),
      tokenPresent: false,
      tokenRevoked: false,
      tokenExpiresAt: null,
      tokenScopeHash: null,
      tokenModuleIds: [],
      scopeRevoked: false,
      targetInApprovedScope: true,
    });
    assert.equal(r.decision, "REJECT");
  });

  it("mission réelle sans route → BLOCKED", () => {
    const n = nextAfterAuthValid({
      isRealMission: true,
      isSyntheticDemo: false,
      approvalRouteConfigured: false,
    });
    assert.equal(n.status, "BLOCKED");
  });

  it("chemin démo jusqu'à QUEUED est cohérent", () => {
    assert.equal(canTransition("AUTH_VALID", "A_SKIPPED_DEMO"), true);
    assert.equal(canTransition("A_SKIPPED_DEMO", "QUEUED"), true);
    assert.equal(canTransition("QUEUED", "RUNNING"), true);
    assert.equal(canTransition("RUNNING", "COMPLETED"), true);
    assert.equal(canTransition("COMPLETED", "REPORT_AVAILABLE"), true);
  });
});
