import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";

/** Miroir des gardes SAV : support peut, approver seul ne peut pas muter. */
function assertCanMutateSav(user: AuthUser) {
  if (!user.staffRoles.some((r) => ["support", "ops", "admin"].includes(r))) {
    throw new ForbiddenException(
      "SAV : rôles support|ops|admin uniquement — approver ne gère pas les tickets ici.",
    );
  }
}

describe("SAV RBAC — support ≠ approbation", () => {
  it("support peut muter les tickets", () => {
    assert.doesNotThrow(() =>
      assertCanMutateSav({
        userId: "1",
        email: "s@a",
        displayName: "S",
        staffRoles: ["support"],
      }),
    );
  });

  it("approver seul ne peut pas créer/changer tickets SAV", () => {
    assert.throws(
      () =>
        assertCanMutateSav({
          userId: "2",
          email: "a@a",
          displayName: "A",
          staffRoles: ["approver"],
        }),
      /approver ne gère pas/,
    );
  });

  it("billing ne peut pas muter SAV", () => {
    assert.throws(
      () =>
        assertCanMutateSav({
          userId: "3",
          email: "b@a",
          displayName: "B",
          staffRoles: ["billing"],
        }),
      ForbiddenException,
    );
  });
});
