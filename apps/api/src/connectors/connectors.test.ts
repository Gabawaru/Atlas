import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { evaluateExecution } from "@atlas/policy-guard";
import { MODULE_WEB_PASSIVE } from "@atlas/shared";
import { CONNECTOR_CATALOG, getCatalogEntry } from "./connector.types";

describe("connector catalog", () => {
  it("présence web + GitHub shortlist sont productionReady", () => {
    const web = getCatalogEntry("web.passive.presence");
    const gh = getCatalogEntry("github.read_only");
    assert.equal(web?.productionReady, true);
    assert.equal(web?.isStub, false);
    assert.equal(gh?.productionReady, true);
    assert.equal(gh?.isStub, false);
    assert.ok(CONNECTOR_CATALOG.length >= 2);
    assert.ok(getCatalogEntry("asm.passive.enrichment"));
    assert.ok(getCatalogEntry("sca.local.analyzers"));
    assert.ok(getCatalogEntry("ti.passive.enrichment"));
    assert.ok(getCatalogEntry("saas.auth.enrichment"));
    assert.equal(getCatalogEntry("cloud.posture.auth")?.isStub, false);
  });
});

describe("Policy Guard + révocation connecteur", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");
  const scopeHash = "s1";
  const base = {
    now,
    moduleId: MODULE_WEB_PASSIVE,
    claimedScopeHash: scopeHash,
    subscriptionActive: true,
    entitlementAllowsModule: true,
    ownerAuthorizationValid: true,
    ownerAuthorizationScopeHash: scopeHash,
    ownerAuthorizationIsStub: false,
    signedAuthzAttested: false,
    approvalApproved: true,
    approvalScopeHash: scopeHash,
    approvalRouteConfigured: true,
    isRealMission: true,
    isSyntheticDemo: false,
    periodStart: new Date("2026-06-01"),
    periodEnd: new Date("2026-07-01"),
    tokenPresent: true,
    tokenRevoked: false,
    tokenExpiresAt: new Date("2026-06-30"),
    tokenScopeHash: scopeHash,
    tokenModuleIds: [MODULE_WEB_PASSIVE],
    scopeRevoked: false,
    targetInApprovedScope: true,
    targetHosts: ["console.pragma-serve.com"],
    connectorRequired: true,
    connectorPresent: true,
    connectorActive: true,
  };

  it("ALLOW avec connecteur actif", () => {
    assert.equal(evaluateExecution(base).decision, "ALLOW");
  });

  it("REJECT après révocation (CONNECTOR_REVOKED)", () => {
    const r = evaluateExecution({ ...base, connectorActive: false });
    assert.equal(r.code, "CONNECTOR_REVOKED");
  });

  it("l'IA ne contourne pas : même avec tout OK sauf connecteur → REJECT", () => {
    const r = evaluateExecution({
      ...base,
      connectorPresent: false,
      connectorActive: false,
    });
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "CONNECTOR_MISSING");
  });
});

describe("connector grants DB (si Postgres)", () => {
  let dbOk = false;
  let prisma: import("@prisma/client").PrismaClient | null = null;
  let tenantId: string | null = null;

  before(async () => {
    try {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      await prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', false)`;
      await prisma.$queryRaw`SELECT 1`;
      const t = await prisma.tenant.findFirst({
        where: { slug: "demo-synth" },
      });
      tenantId = t?.id ?? null;
      dbOk = !!tenantId;
    } catch {
      dbOk = false;
    }
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  it("connect + revoke coupe le grant actif", async (t) => {
    if (!dbOk || !prisma || !tenantId) {
      t.skip("Postgres / seed demo-synth requis");
      return;
    }
    // cleanup previous test grants
    await prisma.connectorGrant.deleteMany({
      where: { tenantId, connectorId: "github.read_only" },
    });

    const grant = await prisma.connectorGrant.create({
      data: {
        tenantId,
        connectorId: "github.read_only",
        status: "active",
        grantedPermissions: ["scm:github:read_meta"],
        grantedScopes: ["repo:read_metadata"],
        externalRef: "mock-github-oauth:test",
        isStub: true,
        productionReady: false,
      },
    });
    assert.equal(grant.status, "active");

    const revoked = await prisma.connectorGrant.update({
      where: { id: grant.id },
      data: {
        status: "revoked",
        revokedAt: new Date(),
        externalRef: "mock-github-oauth:test:revoked",
      },
    });
    assert.equal(revoked.status, "revoked");
    assert.ok(revoked.revokedAt);
    assert.match(revoked.externalRef ?? "", /revoked/);

    const active = await prisma.connectorGrant.findFirst({
      where: {
        tenantId,
        connectorId: "github.read_only",
        status: "active",
      },
    });
    assert.equal(active, null);
  });
});
