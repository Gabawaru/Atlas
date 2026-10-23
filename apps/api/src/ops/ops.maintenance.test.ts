import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateExecution } from "@atlas/policy-guard";
import { MODULE_WEB_PASSIVE } from "@atlas/shared";

function gate(overrides: Partial<Parameters<typeof evaluateExecution>[0]> = {}) {
  const now = new Date("2026-06-15T12:00:00.000Z");
  return evaluateExecution({
    now,
    moduleId: MODULE_WEB_PASSIVE,
    claimedScopeHash: "scope-abc",
    subscriptionActive: true,
    entitlementAllowsModule: true,
    ownerAuthorizationValid: true,
    ownerAuthorizationScopeHash: "scope-abc",
    approvalApproved: true,
    approvalScopeHash: "scope-abc",
    approvalRouteConfigured: true,
    isRealMission: false,
    isSyntheticDemo: true,
    periodStart: new Date("2026-01-01"),
    periodEnd: new Date("2027-01-01"),
    tokenPresent: true,
    tokenRevoked: false,
    tokenExpiresAt: new Date("2027-01-01"),
    tokenScopeHash: "scope-abc",
    tokenModuleIds: [MODULE_WEB_PASSIVE],
    scopeRevoked: false,
    targetInApprovedScope: true,
    connectorRequired: true,
    connectorPresent: true,
    connectorActive: true,
    killSwitch: false,
    ...overrides,
  });
}

describe("ops — maintenance / kill-switch", () => {
  it("maintenance ON (killSwitch) → POLICY_DENY même si preuves OK", () => {
    const r = gate({ killSwitch: true });
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "POLICY_DENY");
    assert.match(r.reason, /maintenance|kill-switch/i);
  });

  it("maintenance OFF → ALLOW si preuves OK", () => {
    const r = gate({ killSwitch: false });
    assert.equal(r.decision, "ALLOW");
  });
});
