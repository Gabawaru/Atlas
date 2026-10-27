import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import { HierarchyService } from "./hierarchy.service";
import type { AuthUser } from "../auth/auth.types";

function user(partial: Partial<AuthUser>): AuthUser {
  return {
    userId: "u1",
    email: "u@test.local",
    displayName: "U",
    staffRoles: ["ops"],
    orgId: "org-a",
    ...partial,
  };
}

describe("HierarchyService.assertCallerOrg", () => {
  const svc = new HierarchyService(
    {} as never,
    {} as never,
    {} as never,
  );

  it("accepte même orgId", () => {
    assert.doesNotThrow(() =>
      svc.assertCallerOrg(user({ orgId: "org-a" }), "org-a"),
    );
  });

  it("refuse orgId différent pour non-admin", () => {
    assert.throws(
      () => svc.assertCallerOrg(user({ orgId: "org-a", staffRoles: ["ops"] }), "org-b"),
      ForbiddenException,
    );
  });

  it("refuse sans orgId pour non-admin", () => {
    assert.throws(
      () =>
        svc.assertCallerOrg(
          user({ orgId: undefined, staffRoles: ["approver"] }),
          "org-a",
        ),
      ForbiddenException,
    );
  });

  it("admin peut cross-org", () => {
    assert.doesNotThrow(() =>
      svc.assertCallerOrg(
        user({ orgId: "org-a", staffRoles: ["admin"] }),
        "org-b",
      ),
    );
  });
});
