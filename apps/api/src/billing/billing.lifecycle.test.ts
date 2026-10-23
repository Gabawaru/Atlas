import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateExecution } from "@atlas/policy-guard";
import {
  isSubscriptionCommerciallyActive,
  MODULE_WEB_PASSIVE,
} from "@atlas/shared";
import { BILLING_DISCLAIMER, BILLING_PRINCIPLE } from "./billing.policy.ts";

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

describe("billing lifecycle × Policy Guard", () => {
  it("principe : abonnement ≠ autorisation pentest", () => {
    assert.match(BILLING_PRINCIPLE, /Abonnement/i);
    assert.match(BILLING_DISCLAIMER, /PSP/i);
  });

  it("abonnement actif seul → REJECT (owner auth manquante)", () => {
    const r = gate({
      subscriptionActive: true,
      ownerAuthorizationValid: false,
      approvalApproved: false,
      tokenPresent: false,
    });
    assert.equal(r.decision, "REJECT");
    assert.ok(
      r.code === "OWNER_AUTH_MISSING" || r.code === "TOKEN_MISSING",
    );
  });

  it("expire commercial → SUBSCRIPTION_INACTIVE même avec owner+token+approval", () => {
    const expired = {
      status: "active",
      endsAt: new Date("2020-01-01T00:00:00.000Z"),
    };
    const commerciallyActive = isSubscriptionCommerciallyActive(
      expired,
      new Date("2026-06-15T12:00:00.000Z"),
    );
    assert.equal(commerciallyActive, false);
    const r = gate({ subscriptionActive: commerciallyActive });
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "SUBSCRIPTION_INACTIVE");
  });

  it("canceled / past_due → SUBSCRIPTION_INACTIVE", () => {
    for (const status of ["canceled", "past_due"] as const) {
      const active = isSubscriptionCommerciallyActive({
        status,
        endsAt: null,
      });
      assert.equal(active, false);
      const r = gate({ subscriptionActive: active });
      assert.equal(r.code, "SUBSCRIPTION_INACTIVE");
    }
  });

  it("paiement stub hors chemin Policy Guard (ALLOW inchangé si preuves OK)", () => {
    // Un paiement simulé n'entre pas dans evaluateExecution — seul subscriptionActive compte
    const r = gate({ subscriptionActive: true });
    assert.equal(r.decision, "ALLOW");
  });
});
