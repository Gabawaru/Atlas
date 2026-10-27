import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import type { AuthUser } from "./auth.types";

function user(partial: Partial<AuthUser>): AuthUser {
  return {
    userId: "u1",
    email: "u@test.local",
    displayName: "U",
    staffRoles: [],
    ...partial,
  };
}

describe("AuthService.requireTenant", () => {
  const auth = new AuthService({} as never, {} as never);

  it("refuse sans tenantId", () => {
    assert.throws(
      () => auth.requireTenant(user({})),
      (e: unknown) => e instanceof ForbiddenException,
    );
  });

  it("accepte tenant sans contrainte de rôle", () => {
    assert.doesNotThrow(() =>
      auth.requireTenant(user({ tenantId: "t1", tenantRole: "viewer" })),
    );
  });

  it("refuse rôles demandés si tenantRole manquant", () => {
    assert.throws(
      () => auth.requireTenant(user({ tenantId: "t1" }), ["owner"]),
      (e: unknown) =>
        e instanceof ForbiddenException &&
        String((e as ForbiddenException).message).includes("owner"),
    );
  });

  it("refuse rôles demandés si tenantRole hors liste", () => {
    assert.throws(
      () =>
        auth.requireTenant(user({ tenantId: "t1", tenantRole: "viewer" }), [
          "owner",
          "operator",
        ]),
      ForbiddenException,
    );
  });

  it("accepte owner dans la liste", () => {
    assert.doesNotThrow(() =>
      auth.requireTenant(user({ tenantId: "t1", tenantRole: "owner" }), [
        "owner",
        "operator",
      ]),
    );
  });
});
