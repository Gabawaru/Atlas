/**
 * Garde-fou legal hold — Postgres optionnel.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { RetentionService } from "./retention.service";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.types";

describe("rétention — legal hold bloque la purge (si Postgres)", () => {
  let prisma: import("@prisma/client").PrismaClient | null = null;
  let tenantId: string | null = null;

  before(async () => {
    try {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      await prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', false)`;
      const t = await prisma.tenant.findFirst({
        where: { slug: "demo-synth" },
      });
      tenantId = t?.id ?? null;
    } catch {
      prisma = null;
      tenantId = null;
    }
  });

  after(async () => {
    if (prisma && tenantId) {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { legalHold: false, legalHoldReason: null, legalHoldAt: null },
      });
      await prisma.$disconnect();
    }
  });

  it("purge dry-run sous hold → heldSkipped, counts 0", async (t) => {
    if (!prisma || !tenantId) {
      t.skip("Postgres / tenant demo-synth requis");
      return;
    }
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        legalHold: true,
        legalHoldReason: "[FICTIF] Hold test rétention",
        legalHoldAt: new Date(),
      },
    });

    const audit = new AuditService(prisma as never);
    const svc = new RetentionService(prisma as never, audit);
    const actor: AuthUser = {
      userId: "test-ops",
      email: "ops@a.atlas.local",
      displayName: "Ops",
      staffRoles: ["ops"],
    };
    void actor;

    const result = await svc.runPurge({
      tenantId,
      dryRun: true,
      categories: ["reports", "llm_usage", "artefacts"],
      actorId: "test-ops",
    });

    assert.equal(result.heldSkipped, true);
    assert.equal(result.counts.reports, 0);
    assert.equal(result.counts.llm_usage, 0);
    assert.equal(result.counts.artefacts, 0);
    assert.match(result.message, /Legal hold/i);
  });
});
