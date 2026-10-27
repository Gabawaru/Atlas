import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateExecution,
  isAggressiveModule,
  isSignedAuthzAttested,
} from "./index";
import type { PolicyEvaluationInput } from "@atlas/shared";
import { MODULE_WEB_PASSIVE } from "@atlas/shared";

const now = new Date("2026-06-15T12:00:00.000Z");
const periodStart = new Date("2026-06-01T00:00:00.000Z");
const periodEnd = new Date("2026-07-01T00:00:00.000Z");
const scopeHash = "abc123scope";

function base(overrides: Partial<PolicyEvaluationInput> = {}): PolicyEvaluationInput {
  return {
    now,
    moduleId: MODULE_WEB_PASSIVE,
    claimedScopeHash: scopeHash,
    subscriptionActive: true,
    entitlementAllowsModule: true,
    ownerAuthorizationValid: true,
    ownerAuthorizationScopeHash: scopeHash,
    // Happy-path réel = preuve non-stub (Sesign / provider réel) ; stub testé à part
    ownerAuthorizationIsStub: false,
    signedAuthzAttested: false,
    approvalApproved: true,
    approvalScopeHash: scopeHash,
    approvalRouteConfigured: true,
    isRealMission: true,
    isSyntheticDemo: false,
    periodStart,
    periodEnd,
    tokenPresent: true,
    tokenRevoked: false,
    tokenExpiresAt: new Date("2026-06-30T00:00:00.000Z"),
    tokenScopeHash: scopeHash,
    tokenModuleIds: [MODULE_WEB_PASSIVE],
    scopeRevoked: false,
    targetInApprovedScope: true,
    connectorRequired: true,
    connectorPresent: true,
    connectorActive: true,
    killSwitch: false,
    ...overrides,
  };
}

describe("Policy Guard (sans LLM)", () => {
  it("ALLOW sur happy path mission réelle", () => {
    const r = evaluateExecution(base());
    assert.equal(r.decision, "ALLOW");
  });

  it("REJECT si abonnement seul (sans owner auth) — abonnement ≠ autorisation", () => {
    const r = evaluateExecution(
      base({ ownerAuthorizationValid: false }),
    );
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "OWNER_AUTH_MISSING");
  });

  it("REJECT si seule approbation A (sans owner) — A ≠ propriétaire", () => {
    const r = evaluateExecution(
      base({
        ownerAuthorizationValid: false,
        approvalApproved: true,
      }),
    );
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "OWNER_AUTH_MISSING");
  });

  it("REJECT mission réelle avec signature stub (sans ATLAS_AUTHZ)", () => {
    const r = evaluateExecution(
      base({ ownerAuthorizationIsStub: true, signedAuthzAttested: false }),
    );
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "OWNER_AUTH_STUB");
  });

  it("REJECT mission réelle si ownerAuthorizationIsStub omis (fail-closed)", () => {
    const r = evaluateExecution(
      base({ ownerAuthorizationIsStub: undefined, signedAuthzAttested: false }),
    );
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "OWNER_AUTH_STUB");
  });

  it("ALLOW mission réelle stub si ATLAS_AUTHZ attesté (Sesign hors bande)", () => {
    const r = evaluateExecution(
      base({ ownerAuthorizationIsStub: true, signedAuthzAttested: true }),
    );
    assert.equal(r.decision, "ALLOW");
  });

  it("REJECT module agressif unsigned même si dans le jeton", () => {
    const r = evaluateExecution(
      base({
        moduleId: "network.aggressive.scan.v1",
        tokenModuleIds: ["network.aggressive.scan.v1"],
        ownerAuthorizationIsStub: true,
        signedAuthzAttested: false,
        // agressif : refus même hors mission réelle
        isRealMission: false,
        isSyntheticDemo: true,
      }),
    );
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "MODULE_OUT_OF_SCOPE");
  });

  it("REJECT mission réelle sans route approbateur", () => {
    const r = evaluateExecution(
      base({ approvalRouteConfigured: false, approvalApproved: false }),
    );
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "NO_APPROVAL_ROUTE");
  });

  it("ALLOW démo synthétique sans approbation A", () => {
    const r = evaluateExecution(
      base({
        isRealMission: false,
        isSyntheticDemo: true,
        ownerAuthorizationIsStub: true,
        approvalApproved: false,
        approvalRouteConfigured: false,
        approvalScopeHash: null,
      }),
    );
    assert.equal(r.decision, "ALLOW");
  });

  it("REJECT hors période", () => {
    const r = evaluateExecution(
      base({ now: new Date("2026-08-01T00:00:00.000Z") }),
    );
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "PERIOD_OUTSIDE");
  });

  it("REJECT révocation token", () => {
    const r = evaluateExecution(base({ tokenRevoked: true }));
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "TOKEN_REVOKED");
  });

  it("REJECT scope mismatch", () => {
    const r = evaluateExecution(
      base({ tokenScopeHash: "other-hash" }),
    );
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "SCOPE_MISMATCH");
  });

  it("REJECT cible hors périmètre", () => {
    const r = evaluateExecution(
      base({ targetInApprovedScope: false }),
    );
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "TARGET_OUT_OF_SCOPE");
  });

  it("REJECT module hors jeton", () => {
    const r = evaluateExecution(
      base({ tokenModuleIds: ["other.module"] }),
    );
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "MODULE_NOT_IN_TOKEN");
  });

  it("REJECT subscription inactive même si approvals OK", () => {
    const r = evaluateExecution(base({ subscriptionActive: false }));
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "SUBSCRIPTION_INACTIVE");
  });

  it("REJECT si connecteur requis révoqué", () => {
    const r = evaluateExecution(
      base({ connectorRequired: true, connectorPresent: true, connectorActive: false }),
    );
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "CONNECTOR_REVOKED");
  });

  it("REJECT si connecteur requis manquant", () => {
    const r = evaluateExecution(
      base({ connectorRequired: true, connectorPresent: false }),
    );
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "CONNECTOR_MISSING");
  });
});

describe("ATLAS_AUTHZ / signed-authz helpers", () => {
  it("isSignedAuthzAttested seulement si ATLAS_AUTHZ=signed", () => {
    assert.equal(isSignedAuthzAttested({}), false);
    assert.equal(isSignedAuthzAttested({ ATLAS_AUTHZ: "pending" }), false);
    assert.equal(isSignedAuthzAttested({ ATLAS_AUTHZ: "signed" }), true);
  });

  it("isAggressiveModule détecte packs agressifs, pas le passif MVP", () => {
    assert.equal(isAggressiveModule(MODULE_WEB_PASSIVE), false);
    assert.equal(isAggressiveModule("network.aggressive.scan.v1"), true);
    assert.equal(isAggressiveModule("web.exploit.probe.v1"), true);
  });
});
