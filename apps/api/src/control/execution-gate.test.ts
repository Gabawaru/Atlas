import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildExecutionGateInput,
  evaluateMissionExecution,
  type GateMissionSlice,
} from "./execution-gate";
import { WEB_PASSIVE_MODULE_ID } from "./web-passive";

function mission(partial: Partial<GateMissionSlice> = {}): GateMissionSlice {
  const scopeHash = "scope-abc";
  return {
    id: "m1",
    tenantId: "t1",
    synthetic: true,
    isRealMission: false,
    moduleIds: [WEB_PASSIVE_MODULE_ID],
    scopeVersions: [
      {
        scopeHash,
        assetIds: ["a1"],
        exclusions: [],
        periodStart: new Date("2020-01-01"),
        periodEnd: new Date("2099-01-01"),
        revokedAt: null,
      },
    ],
    tokens: [
      {
        id: "tok1",
        scopeHash,
        moduleIds: [WEB_PASSIVE_MODULE_ID],
        expiresAt: new Date("2099-01-01"),
        revokedAt: null,
      },
    ],
    ownerAuths: [{ status: "valid", scopeHash, isStubSignature: false }],
    approvalReqs: [],
    ...partial,
  };
}

const okConnector = {
  connectorRequired: false,
  connectorPresent: true,
  connectorActive: true,
};

describe("execution-gate (worker re-gate inputs)", () => {
  const prevAuthz = process.env.ATLAS_AUTHZ;
  const prevKey = process.env.PRAGMA_SIGN_API_KEY;

  afterEach(() => {
    if (prevAuthz === undefined) delete process.env.ATLAS_AUTHZ;
    else process.env.ATLAS_AUTHZ = prevAuthz;
    if (prevKey === undefined) delete process.env.PRAGMA_SIGN_API_KEY;
    else process.env.PRAGMA_SIGN_API_KEY = prevKey;
  });

  it("ALLOW pour démo synthétique saine", async () => {
    delete process.env.PRAGMA_SIGN_API_KEY;
    const gate = await evaluateMissionExecution({
      mission: mission(),
      subscription: {
        status: "active",
        endsAt: null,
        plan: { modulesEntitled: [WEB_PASSIVE_MODULE_ID] },
      },
      approvalRouteConfigured: true,
      assetsCount: 1,
      connectorGuard: okConnector,
      killSwitch: false,
    });
    assert.equal(gate.decision, "ALLOW");
  });

  it("REJECT kill-switch même si enqueue aurait ALLOW", async () => {
    delete process.env.PRAGMA_SIGN_API_KEY;
    const gate = await evaluateMissionExecution({
      mission: mission(),
      subscription: {
        status: "active",
        endsAt: null,
        plan: { modulesEntitled: [WEB_PASSIVE_MODULE_ID] },
      },
      approvalRouteConfigured: true,
      assetsCount: 1,
      connectorGuard: okConnector,
      killSwitch: true,
    });
    assert.equal(gate.decision, "REJECT");
    assert.equal(gate.code, "POLICY_DENY");
  });

  it("REJECT token révoqué (stale job après revoke)", async () => {
    delete process.env.PRAGMA_SIGN_API_KEY;
    const m = mission({
      tokens: [
        {
          id: "tok1",
          scopeHash: "scope-abc",
          moduleIds: [WEB_PASSIVE_MODULE_ID],
          expiresAt: new Date("2099-01-01"),
          revokedAt: new Date(),
        },
      ],
    });
    const gate = await evaluateMissionExecution({
      mission: m,
      subscription: {
        status: "active",
        endsAt: null,
        plan: { modulesEntitled: [WEB_PASSIVE_MODULE_ID] },
      },
      approvalRouteConfigured: true,
      assetsCount: 1,
      connectorGuard: okConnector,
      killSwitch: false,
    });
    assert.equal(gate.decision, "REJECT");
    assert.ok(
      gate.code === "TOKEN_REVOKED" || gate.code === "TOKEN_MISSING",
      `code=${gate.code}`,
    );
  });

  it("REJECT scope révoqué", async () => {
    delete process.env.PRAGMA_SIGN_API_KEY;
    const base = mission();
    const m = mission({
      scopeVersions: [
        {
          ...base.scopeVersions[0]!,
          revokedAt: new Date(),
        },
      ],
    });
    const gate = await evaluateMissionExecution({
      mission: m,
      subscription: {
        status: "active",
        endsAt: null,
        plan: { modulesEntitled: [WEB_PASSIVE_MODULE_ID] },
      },
      approvalRouteConfigured: true,
      assetsCount: 1,
      connectorGuard: okConnector,
      killSwitch: false,
    });
    assert.equal(gate.decision, "REJECT");
    assert.equal(gate.code, "SCOPE_REVOKED");
  });

  it("buildExecutionGateInput lie claimedScopeHash au scope courant", async () => {
    delete process.env.PRAGMA_SIGN_API_KEY;
    const input = await buildExecutionGateInput({
      mission: mission(),
      subscription: null,
      approvalRouteConfigured: false,
      assetsCount: 0,
      connectorGuard: okConnector,
      killSwitch: false,
    });
    assert.equal(input.claimedScopeHash, "scope-abc");
    assert.equal(input.subscriptionActive, false);
    assert.equal(input.ownerAuthorizationIsStub, false);
  });

  it("REJECT mission réelle si owner stub sans ATLAS_AUTHZ=signed", async () => {
    delete process.env.ATLAS_AUTHZ;
    delete process.env.PRAGMA_SIGN_API_KEY;
    const gate = await evaluateMissionExecution({
      mission: mission({
        synthetic: false,
        isRealMission: true,
        ownerAuths: [
          { status: "valid", scopeHash: "scope-abc", isStubSignature: true },
        ],
      }),
      subscription: {
        status: "active",
        endsAt: null,
        plan: { modulesEntitled: [WEB_PASSIVE_MODULE_ID] },
      },
      approvalRouteConfigured: true,
      assetsCount: 1,
      connectorGuard: okConnector,
      killSwitch: false,
    });
    assert.equal(gate.decision, "REJECT");
    assert.equal(gate.code, "OWNER_AUTH_STUB");
  });

  it("ALLOW mission réelle stub si signedAuthzAttested (poll/override)", async () => {
    delete process.env.PRAGMA_SIGN_API_KEY;
    const gate = await evaluateMissionExecution({
      mission: mission({
        synthetic: false,
        isRealMission: true,
        ownerAuths: [
          {
            status: "valid",
            scopeHash: "scope-abc",
            isStubSignature: true,
            signatureEnvelopeId: "env-1",
          },
        ],
        approvalReqs: [
          {
            decisions: [
              { decision: "approved", scopeHash: "scope-abc" },
            ],
          },
        ],
      }),
      subscription: {
        status: "active",
        endsAt: null,
        plan: { modulesEntitled: [WEB_PASSIVE_MODULE_ID] },
      },
      approvalRouteConfigured: true,
      assetsCount: 1,
      connectorGuard: okConnector,
      killSwitch: false,
      signedAuthzAttested: true,
    });
    assert.equal(gate.decision, "ALLOW");
  });
});
