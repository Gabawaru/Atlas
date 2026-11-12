import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import { isSubscriptionCommerciallyActive } from "@atlas/shared";

/**
 * Garde commerciale pour prise en charge client → Pragma.
 * Miroir de TicketsService.requestPragmaHandoff (abonnement actif requis).
 */
function assertSupportHandoffAllowed(sub: {
  status: string;
  endsAt: Date | null;
}) {
  const now = new Date("2026-11-12T12:00:00.000Z");
  if (!isSubscriptionCommerciallyActive(sub, now)) {
    throw new ForbiddenException(
      "Prise en charge réservée aux clients support (abonnement Pragma actif). Le scan local reste gratuit et les findings restent sur la machine.",
    );
  }
}

describe("support handoff — abonnement Pragma", () => {
  it("abonnement actif → handoff autorisé", () => {
    assert.doesNotThrow(() =>
      assertSupportHandoffAllowed({ status: "active", endsAt: null }),
    );
  });

  it("sans abonnement actif → refus (local reste gratuit)", () => {
    assert.throws(
      () =>
        assertSupportHandoffAllowed({
          status: "canceled",
          endsAt: null,
        }),
      /abonnement Pragma/,
    );
  });

  it("endsAt passé → refus", () => {
    assert.throws(
      () =>
        assertSupportHandoffAllowed({
          status: "active",
          endsAt: new Date("2026-10-01T00:00:00.000Z"),
        }),
      ForbiddenException,
    );
  });
});
