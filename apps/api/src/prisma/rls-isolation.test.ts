/**
 * Isolation multi-tenant via RLS Postgres (FORCE).
 * Connexion : ATLAS_RLS_DATABASE_URL (rôle atlas_app NOSUPERUSER) —
 * le user Docker `atlas` est souvent superuser et contourne RLS.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const RLS_URL =
  process.env.ATLAS_RLS_DATABASE_URL ??
  "postgresql://atlas_app:atlas_dev_only@localhost:5432/atlas?schema=public";

const ADMIN_URL =
  process.env.DATABASE_URL ??
  "postgresql://atlas:atlas_dev_only@localhost:5432/atlas?schema=public";

describe("RLS multi-tenant (Postgres)", () => {
  let admin: PrismaClient | null = null;
  let prisma: PrismaClient | null = null;
  let dbOk = false;
  let tenantA: string | null = null;
  let tenantB: string | null = null;
  let missionA: string | null = null;
  let missionB: string | null = null;

  before(async () => {
    try {
      admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
      await admin.$connect();
      await admin.$executeRaw`SELECT set_config('app.bypass_rls', 'on', false)`;

      // Assure grants (idempotent) si migrate vient de créer atlas_app
      await admin.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
            GRANT CONNECT ON DATABASE atlas TO atlas_app;
            GRANT USAGE ON SCHEMA public TO atlas_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO atlas_app;
          END IF;
        END $$;
      `);

      prisma = new PrismaClient({ datasources: { db: { url: RLS_URL } } });
      await prisma.$connect();
      await prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', false)`;

      const tenants = await admin.tenant.findMany({
        orderBy: { slug: "asc" },
        take: 2,
      });
      if (tenants.length < 2) {
        dbOk = false;
        return;
      }
      tenantA = tenants[0]!.id;
      tenantB = tenants[1]!.id;
      let mA = await admin.mission.findFirst({ where: { tenantId: tenantA } });
      let mB = await admin.mission.findFirst({ where: { tenantId: tenantB } });
      if (!mA) {
        mA = await admin.mission.create({
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
        mB = await admin.mission.create({
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

      // Preuve que atlas_app n'est pas superuser
      const roles = await prisma.$queryRaw<
        { rolsuper: boolean; rolbypassrls: boolean }[]
      >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
      if (roles[0]?.rolsuper || roles[0]?.rolbypassrls) {
        throw new Error(
          "ATLAS_RLS_DATABASE_URL doit viser un rôle non-superuser (atlas_app)",
        );
      }
      dbOk = true;
    } catch (e) {
      console.error("RLS setup failed", e);
      dbOk = false;
    }
  });

  after(async () => {
    await prisma?.$disconnect();
    await admin?.$disconnect();
  });

  async function asTenant<T>(
    tenantId: string,
    fn: (tx: { mission: PrismaClient["mission"] }) => Promise<T>,
  ): Promise<T> {
    assert.ok(prisma);
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'off', true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx as never);
    });
  }

  it("sous tenant A : mission B invisible (RLS)", async (t) => {
    if (!dbOk || !tenantA || !missionB) {
      t.skip("Postgres / atlas_app / 2 tenants requis");
      return;
    }
    const leak = await asTenant(tenantA, (tx) =>
      tx.mission.findFirst({ where: { id: missionB! } }),
    );
    assert.equal(leak, null);
  });

  it("sous tenant A : mission A visible", async (t) => {
    if (!dbOk || !tenantA || !missionA) {
      t.skip("Postgres / atlas_app / 2 tenants requis");
      return;
    }
    const row = await asTenant(tenantA, (tx) =>
      tx.mission.findFirst({ where: { id: missionA! } }),
    );
    assert.ok(row);
    assert.equal(row!.tenantId, tenantA);
  });

  it("sous tenant A : aucune mission du tenant B", async (t) => {
    if (!dbOk || !tenantA || !tenantB) {
      t.skip("Postgres / atlas_app / 2 tenants requis");
      return;
    }
    const underA = await asTenant(tenantA, (tx) => tx.mission.findMany());
    assert.ok(underA.every((m) => m.tenantId === tenantA));
    assert.ok(!underA.some((m) => m.tenantId === tenantB));
  });

  it("bypass RLS : voit les deux tenants (ops/seed)", async (t) => {
    if (!dbOk || !prisma || !missionA || !missionB) {
      t.skip("Postgres / atlas_app / 2 tenants requis");
      return;
    }
    await prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', false)`;
    const a = await prisma.mission.findFirst({ where: { id: missionA } });
    const b = await prisma.mission.findFirst({ where: { id: missionB } });
    assert.ok(a);
    assert.ok(b);
  });

  it("INSERT sous mauvais tenant refusé (WITH CHECK)", async (t) => {
    if (!dbOk || !tenantA || !tenantB) {
      t.skip("Postgres / atlas_app / 2 tenants requis");
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
