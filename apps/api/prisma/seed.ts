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
  // FORCE RLS : seed en bypass (migration rls_tenant)
  await prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', false)`;

  await prisma.auditEvent.deleteMany();
  await prisma.syncJournalEntry.deleteMany();
  await prisma.llmUsageLog.deleteMany();
  await prisma.supportTicket.deleteMany();
  await prisma.vulnFeedCache.deleteMany();
  await prisma.softwareComponent.deleteMany();
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
  await prisma.connectorGrant.deleteMany();
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
      llmTokenCapMonthly: 200_000,
      llmEuroCapCentsMonthly: 500, // 5,00 € estimés / mois
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

  // example.com = domaine de documentation IANA (résolution DNS/HTTP publique réelle)
  const asset = await prisma.asset.create({
    data: {
      tenantId: tenantDemo.id,
      type: "domain",
      value: "example.com",
      normalized: "example.com",
      verified: true,
      synthetic: true,
    },
  });

  // Connecteur présence web actif (MVP réel) — révocable
  await prisma.connectorGrant.create({
    data: {
      tenantId: tenantDemo.id,
      connectorId: "web.passive.presence",
      status: "active",
      grantedPermissions: ["control:web.passive.execute"],
      grantedScopes: ["assets:domain", "assets:url"],
      externalRef: "web-passive-grant:seed",
      isStub: false,
      productionReady: true,
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

  // Inventaire logiciel FICTIF → matching feeds passifs (confiance ≠ gravité)
  const { VERSION_MATCH_DISCLAIMER } = await import(
    "../src/vuln/disclaimer"
  );
  const { matchFromFixtures, mergeCandidates } = await import(
    "../src/vuln/match"
  );
  const inventory = [
    {
      name: "openssl",
      version: "1.0.2k",
      ecosystem: "openssl",
      rawEvidence: "[FICTIF] seed inventory openssl/1.0.2k",
    },
    {
      name: "nginx",
      version: "1.14.0",
      ecosystem: "nginx",
      rawEvidence: "[FICTIF] seed inventory nginx/1.14.0",
    },
    {
      name: "log4j-core",
      version: "2.14.1",
      ecosystem: "maven",
      rawEvidence: "[FICTIF] seed inventory log4j-core@2.14.1",
    },
  ];
  for (const item of inventory) {
    await prisma.softwareComponent.create({
      data: {
        tenantId: tenantDemo.id,
        missionId: mission.id,
        name: item.name,
        version: item.version,
        ecosystem: item.ecosystem,
        observedFrom: "seed",
        synthetic: true,
        rawEvidence: item.rawEvidence,
      },
    });
  }
  const seedMatches = mergeCandidates(
    inventory.flatMap((item) => matchFromFixtures(item)),
  );
  for (const cand of seedMatches) {
    await prisma.finding.create({
      data: {
        missionId: mission.id,
        severity: cand.severity === "unknown" ? "info" : cand.severity,
        confidence: cand.confidence,
        cveId: cand.cveId,
        kevListed: cand.kevListed,
        feedSources: cand.feedSources,
        matchDisclaimer: VERSION_MATCH_DISCLAIMER,
        title: `[FICTIF] ${cand.cveId} — ${cand.title}`,
        summary: `${cand.summary} Confiance: ${cand.confidence} ≠ gravité ${cand.severity}.`,
        technical: JSON.stringify(
          {
            cveId: cand.cveId,
            confidence: cand.confidence,
            severity: cand.severity,
            kevListed: cand.kevListed,
            feedSources: cand.feedSources,
            disclaimer: VERSION_MATCH_DISCLAIMER,
          },
          null,
          2,
        ),
        synthetic: true,
      },
    });
  }

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

  const { AUDIT_GENESIS, hashAuditEvent } = await import(
    "../src/audit/audit-chain"
  );
  const seedPayload = { synthetic: true };
  const seedHash = hashAuditEvent({
    prevHash: AUDIT_GENESIS,
    tenantId: tenantDemo.id,
    action: "seed.completed",
    objectType: "system",
    payload: seedPayload,
  });
  await prisma.auditEvent.create({
    data: {
      tenantId: tenantDemo.id,
      action: "seed.completed",
      objectType: "system",
      payload: seedPayload,
      prevHash: AUDIT_GENESIS,
      hash: seedHash,
    },
  });

  const supportUser = await prisma.user.findUniqueOrThrow({
    where: { email: "support@a.atlas.local" },
  });
  await prisma.supportTicket.create({
    data: {
      tenantId: tenantDemo.id,
      missionId: mission.id,
      subject: "[FICTIF] Question client — lecture rapport",
      body: "Données de démonstration : le client demande une clarification sur le bilan décideur. SAV ≠ approbation.",
      status: "open",
      category: "question",
      createdByUserId: supportUser.id,
      assigneeUserId: supportUser.id,
      synthetic: true,
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
