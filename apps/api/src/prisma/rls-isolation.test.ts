/**
 * Isolation multi-tenant via RLS Postgres (FORCE).
 * Preuve : sous asTenant(A), les lignes du tenant B sont invisibles.
 * Prérequis : rôle DB non-superuser (migration rls_nosuperuser).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

describe("RLS multi-tenant (Postgres)", () => {
  let prisma: PrismaClient | null = null;
  let dbOk = false;
  let tenantA: string | null = null;
  let tenantB: string | null = null;
  let missionA: string | null = null;
  let missionB: string | null = null;

  before(async () => {
    try {
      prisma = new PrismaClient();
      await prisma.$connect();
      await prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', false)`;
      await prisma.$queryRaw`SELECT 1`;
      const tenants = await prisma.tenant.findMany({
        orderBy: { slug: "asc" },
        take: 2,
      });
      if (tenants.length < 2) {
        dbOk = false;
        return;
      }
      tenantA = tenants[0]!.id;
      tenantB = tenants[1]!.id;
      let mA = await prisma.mission.findFirst({ where: { tenantId: tenantA } });
      let mB = await prisma.mission.findFirst({ where: { tenantId: tenantB } });
      if (!mA) {
        mA = await prisma.mission.create({
          data: {
            tenantId: tenantA,
            title: "[FICTIF] RLS A",
            synthetic: true,
            isRealMission: false,
            status: "DRAFT",
          },
        });
      }
      if (!mB) {
        mB = await prisma.mission.create({
          data: {
            tenantId: tenantB,
            title: "[FICTIF] RLS B",
            synthetic: true,
            isRealMission: false,
            status: "DRAFT",
          },
        });
      }
      missionA = mA.id;
      missionB = mB.id;
      dbOk = true;
    } catch (e) {
      console.error("RLS setup failed", e);
      dbOk = false;
      prisma = null;
    }
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  async function asTenant<T>(
    tenantId: string,
    fn: (tx: {
      mission: PrismaClient["mission"];
    }) => Promise<T>,
  ): Promise<T> {
    assert.ok(prisma);
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'off', true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx as never);
    });
  }

  it("sous tenant A : mission B invisible (RLS)", async (t) => {
    if (!dbOk || !prisma || !tenantA || !missionB) {
      t.skip("Postgres / 2 tenants requis");
      return;
    }
    const leak = await asTenant(tenantA, (tx) =>
      tx.mission.findFirst({ where: { id: missionB! } }),
    );
    assert.equal(leak, null);
  });

  it("sous tenant A : mission A visible", async (t) => {
    if (!dbOk || !tenantA || !missionA) {
      t.skip("Postgres / 2 tenants requis");
      return;
    }
    const row = await asTenant(tenantA, (tx) =>
      tx.mission.findFirst({ where: { id: missionA! } }),
    );
    assert.ok(row);
    assert.equal(row!.tenantId, tenantA);
  });

  it("sous tenant A : aucune mission du tenant B", async (t) => {
    if (!dbOk || !prisma || !tenantA || !tenantB) {
      t.skip("Postgres / 2 tenants requis");
      return;
    }
    const underA = await asTenant(tenantA, (tx) => tx.mission.findMany());
    assert.ok(underA.every((m) => m.tenantId === tenantA));
    assert.ok(!underA.some((m) => m.tenantId === tenantB));
  });

  it("bypass RLS : voit les deux tenants (ops/seed)", async (t) => {
    if (!dbOk || !prisma || !missionA || !missionB) {
      t.skip("Postgres / 2 tenants requis");
      return;
    }
    await prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', false)`;
    const a = await prisma.mission.findFirst({ where: { id: missionA } });
    const b = await prisma.mission.findFirst({ where: { id: missionB } });
    assert.ok(a);
    assert.ok(b);
  });

  it("INSERT sous mauvais tenant refusé (WITH CHECK)", async (t) => {
    if (!dbOk || !prisma || !tenantA || !tenantB) {
      t.skip("Postgres / 2 tenants requis");
      return;
    }
    let rejected = false;
    try {
      await asTenant(tenantA, (tx) =>
        tx.mission.create({
          data: {
            tenantId: tenantB!,
            title: "[FICTIF] leak insert",
            synthetic: true,
            isRealMission: false,
          },
        }),
      );
    } catch {
      rejected = true;
    }
    assert.equal(rejected, true, "INSERT cross-tenant doit être refusé par RLS");
  });
});
