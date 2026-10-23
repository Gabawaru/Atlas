import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import type { StaffRole } from "@atlas/shared";
import { BILLING_SAFE_FIELDS, BILLING_PRINCIPLE } from "./billing.policy.ts";

type User = { staffRoles: StaffRole[] };

function requireStaff(user: User, roles: StaffRole[]) {
  if (!roles.some((r) => user.staffRoles.includes(r))) {
    throw new ForbiddenException("Rôle staff requis");
  }
}

function canMutateBilling(user: User) {
  requireStaff(user, ["billing", "admin"]);
}

function canReadBilling(user: User) {
  requireStaff(user, ["billing", "admin", "ops"]);
}

function canReadEntitlementsSecurity(user: User) {
  // Billing exclu — matrice RoE/jetons réservée sécu
  requireStaff(user, ["admin", "ops", "support", "approver"]);
}

describe("billing RBAC", () => {
  it("billing / admin peuvent muter licences", () => {
    assert.doesNotThrow(() => canMutateBilling({ staffRoles: ["billing"] }));
    assert.doesNotThrow(() => canMutateBilling({ staffRoles: ["admin"] }));
  });

  it("support / approver ne peuvent pas muter billing", () => {
    assert.throws(
      () => canMutateBilling({ staffRoles: ["support"] }),
      ForbiddenException,
    );
    assert.throws(
      () => canMutateBilling({ staffRoles: ["approver"] }),
      ForbiddenException,
    );
  });

  it("ops peut lire commercial, pas muter", () => {
    assert.doesNotThrow(() => canReadBilling({ staffRoles: ["ops"] }));
    assert.throws(
      () => canMutateBilling({ staffRoles: ["ops"] }),
      ForbiddenException,
    );
  });

  it("billing exclu de la matrice sécu entitlements (RoE/jetons)", () => {
    assert.throws(
      () => canReadEntitlementsSecurity({ staffRoles: ["billing"] }),
      ForbiddenException,
    );
    assert.doesNotThrow(() =>
      canReadEntitlementsSecurity({ staffRoles: ["approver"] }),
    );
  });

  it("payload commercial n'expose pas de champs sécu", () => {
    const forbidden = [
      "scopeHash",
      "ownerAuth",
      "token",
      "roe",
      "finding",
      "missions",
    ];
    for (const f of forbidden) {
      assert.equal(
        (BILLING_SAFE_FIELDS as readonly string[]).includes(f),
        false,
        `champ sécu ${f} ne doit pas être dans BILLING_SAFE_FIELDS`,
      );
    }
    assert.match(BILLING_PRINCIPLE, /n'autorise jamais seul/i);
  });
});
