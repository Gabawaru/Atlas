/**
 * Seeds FICTIVES — clairement marquées. Aucune cible réelle, aucun secret réel.
 */
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { MODULE_WEB_PASSIVE } from "@atlas/shared";
import { hashScope } from "@atlas/policy-guard";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seed Atlas MVP (données FICTIVES)...");

  await prisma.auditEvent.deleteMany();
  await prisma.finding.deleteMany();
  await prisma.report.deleteMany();
  await prisma.jobRun.deleteMany();
  await prisma.authorizationToken.deleteMany();
  await prisma.approvalDecision.deleteMany();
  await prisma.approvalRequest.deleteMany();
  await prisma.ownerAuthorization.deleteMany();
  await prisma.scopeVersion.deleteMany();
  await prisma.mission.deleteMany();
  await prisma.approvalRoutingPolicy.deleteMany();
  await prisma.staffGroup.deleteMany();
  await prisma.secretRef.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.staffMembership.deleteMany();
  await prisma.tenantMembership.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({
    data: { name: "Entreprise A (plateforme Atlas — FICTIF)" },
  });

  const passwordHash = await bcrypt.hash("atlas-demo", 10);

  const clientOwner = await prisma.user.create({
    data: {
      email: "owner@demo.atlas.local",
      displayName: "Camille Client (FICTIF)",
      passwordHash,
    },
  });
  const approver = await prisma.user.create({
    data: {
      email: "approver@a.atlas.local",
      displayName: "Alex Approver (FICTIF)",
      passwordHash,
    },
  });
  const support = await prisma.user.create({
    data: {
      email: "support@a.atlas.local",
      displayName: "Sam Support (FICTIF)",
      passwordHash,
    },
  });
  const billing = await prisma.user.create({
    data: {
      email: "billing@a.atlas.local",
      displayName: "Billie Billing (FICTIF)",
      passwordHash,
    },
  });
  const ops = await prisma.user.create({
    data: {
      email: "ops@a.atlas.local",
      displayName: "Omar Ops (FICTIF)",
      passwordHash,
    },
  });
  const admin = await prisma.user.create({
    data: {
      email: "admin@a.atlas.local",
      displayName: "Ada Admin (FICTIF)",
      passwordHash,
    },
  });

  for (const [userId, staffRole] of [
    [admin.id, "admin"],
    [support.id, "support"],
    [billing.id, "billing"],
    [ops.id, "ops"],
    [approver.id, "approver"],
  ] as const) {
    await prisma.staffMembership.create({
      data: { orgId: org.id, userId, staffRole },
    });
  }

  const tenantDemo = await prisma.tenant.create({
    data: {
      orgId: org.id,
      slug: "demo-synth",
      name: "Client Démo Synthétique (FICTIF)",
      syntheticDemo: true,
    },
  });

  const tenantRealBlocked = await prisma.tenant.create({
    data: {
      orgId: org.id,
      slug: "acme-sans-route",
      name: "Acme Sans Routage A (FICTIF — pour test BLOCKED)",
      syntheticDemo: false,
    },
  });

  await prisma.tenantMembership.create({
    data: {
      tenantId: tenantDemo.id,
      userId: clientOwner.id,
      role: "owner",
    },
  });

  const plan = await prisma.plan.create({
    data: {
      code: "atlas-starter-fictif",
      name: "Starter FICTIF",
      modulesEntitled: [MODULE_WEB_PASSIVE],
      maxUsers: 5,
    },
  });

  await prisma.subscription.create({
    data: {
      tenantId: tenantDemo.id,
      planId: plan.id,
      status: "active",
    },
  });
  await prisma.subscription.create({
    data: {
      tenantId: tenantRealBlocked.id,
      planId: plan.id,
      status: "active",
    },
  });

  const asset = await prisma.asset.create({
    data: {
      tenantId: tenantDemo.id,
      type: "domain",
      value: "demo.atlas.local",
      normalized: "demo.atlas.local",
      verified: true,
      synthetic: true,
    },
  });

  // Tenant démo : import stub routage (groupe fictif) — pour parcours happy path admin
  const stubGroup = await prisma.staffGroup.create({
    data: {
      orgId: org.id,
      name: "[STUB] Approbateurs fictifs — pas la hiérarchie réelle A",
      isStub: true,
      memberIds: [approver.id],
    },
  });
  await prisma.approvalRoutingPolicy.create({
    data: {
      tenantId: tenantDemo.id,
      orgWide: false,
      modulePattern: "*",
      staffGroupId: stubGroup.id,
      enabled: true,
      isStub: true,
    },
  });
  // tenantRealBlocked : volontairement AUCUNE policy → missions réelles BLOCKED

  // Mission démo déjà au rapport (exemple)
  const periodStart = new Date("2026-06-01T00:00:00Z");
  const periodEnd = new Date("2026-12-31T00:00:00Z");
  const mission = await prisma.mission.create({
    data: {
      tenantId: tenantDemo.id,
      title: "[FICTIF] Présence web démo",
      status: "REPORT_AVAILABLE",
      synthetic: true,
      isRealMission: false,
      uxNeedIds: ["web_presence"],
      moduleIds: [MODULE_WEB_PASSIVE],
    },
  });
  const scopePayload = {
    missionId: mission.id,
    assetIds: [asset.id],
    methods: [MODULE_WEB_PASSIVE],
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
  const scopeHash = await hashScope(scopePayload);
  await prisma.scopeVersion.create({
    data: {
      missionId: mission.id,
      version: 1,
      assetIds: [asset.id],
      methods: [MODULE_WEB_PASSIVE],
      periodStart,
      periodEnd,
      scopeHash,
    },
  });
  await prisma.finding.create({
    data: {
      missionId: mission.id,
      severity: "low",
      title: "[FICTIF] En-tête Server exposé",
      summary: "Exemple de finding de démonstration — aucune cible réelle.",
      technical: "Server: atlas-synthetic/1.0",
      synthetic: true,
    },
  });
  await prisma.report.create({
    data: {
      missionId: mission.id,
      synthetic: true,
      executiveSummary:
        "[FICTIF] Bilan décideur : exposition limitée sur le domaine de démonstration. Aucune action requise hors environnement de démo.",
      technicalDetail:
        "[FICTIF] Détail technique : DNS A 203.0.113.10 ; HTTP 200 ; Server atlas-synthetic/1.0. Module web.passive.presence.v1.",
      exportJson: {
        format: "json",
        synthetic: true,
        disclaimer: "Données de démonstration — aucune cible réelle",
      },
    },
  });

  await prisma.auditEvent.create({
    data: {
      tenantId: tenantDemo.id,
      action: "seed.completed",
      objectType: "system",
      payload: { synthetic: true },
      prevHash: "GENESIS",
      hash: "seed-bootstrap",
    },
  });

  console.log("✅ Seed OK");
  console.log("Comptes locaux (mot de passe: atlas-demo) :");
  console.log("  owner@demo.atlas.local     — client owner");
  console.log("  approver@a.atlas.local     — staff approver");
  console.log("  support@a.atlas.local      — staff support (ne peut pas approve)");
  console.log("  billing@a.atlas.local      — staff billing");
  console.log("  ops@a.atlas.local          — staff ops");
  console.log("  admin@a.atlas.local        — staff admin");
  console.log("Tenant sans routage A (test BLOCKED): acme-sans-route");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
