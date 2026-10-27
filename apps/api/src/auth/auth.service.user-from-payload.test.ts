import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";

describe("AuthService.userFromPayload (DB reload)", () => {
  it("refuse user inactif", async () => {
    const prisma = {
      user: {
        findUnique: async () => ({
          id: "u1",
          email: "a@test.local",
          displayName: "A",
          status: "disabled",
          tenantMemberships: [],
          staffMemberships: [],
        }),
      },
    };
    const auth = new AuthService(prisma as never, {} as never);
    await assert.rejects(
      () => auth.userFromPayload({ sub: "u1", email: "a@test.local" }),
      UnauthorizedException,
    );
  });

  it("refuse user introuvable", async () => {
    const prisma = {
      user: { findUnique: async () => null },
    };
    const auth = new AuthService(prisma as never, {} as never);
    await assert.rejects(
      () => auth.userFromPayload({ sub: "missing" }),
      UnauthorizedException,
    );
  });

  it("ignore staffRoles JWT périmés — prend la DB", async () => {
    const prisma = {
      user: {
        findUnique: async () => ({
          id: "u1",
          email: "a@test.local",
          displayName: "A",
          status: "active",
          tenantMemberships: [{ tenantId: "t1", role: "viewer" }],
          staffMemberships: [{ staffRole: "ops", orgId: "org1" }],
        }),
      },
    };
    const auth = new AuthService(prisma as never, {} as never);
    const user = await auth.userFromPayload({
      sub: "u1",
      email: "stale@old.local",
      tenantId: "evil-tenant",
      tenantRole: "owner",
      staffRoles: ["admin"],
      orgId: "evil-org",
      displayName: "Stale",
    });
    assert.equal(user.email, "a@test.local");
    assert.equal(user.tenantId, "t1");
    assert.equal(user.tenantRole, "viewer");
    assert.deepEqual(user.staffRoles, ["ops"]);
    assert.equal(user.orgId, "org1");
    assert.equal(user.displayName, "A");
  });

  it("refuse payload sans sub", async () => {
    const auth = new AuthService({} as never, {} as never);
    await assert.rejects(
      () => auth.userFromPayload({ email: "x@y.z" }),
      UnauthorizedException,
    );
  });
});
