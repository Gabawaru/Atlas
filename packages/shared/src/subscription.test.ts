import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSubscriptionCommerciallyActive } from "./index.ts";

describe("isSubscriptionCommerciallyActive", () => {
  const now = new Date("2026-10-23T12:00:00.000Z");

  it("active sans endsAt → true", () => {
    assert.equal(
      isSubscriptionCommerciallyActive({ status: "active", endsAt: null }, now),
      true,
    );
  });

  it("trialing avec endsAt futur → true", () => {
    assert.equal(
      isSubscriptionCommerciallyActive(
        { status: "trialing", endsAt: new Date("2026-11-01T00:00:00.000Z") },
        now,
      ),
      true,
    );
  });

  it("active avec endsAt passé → false (TTL commercial)", () => {
    assert.equal(
      isSubscriptionCommerciallyActive(
        { status: "active", endsAt: new Date("2026-10-01T00:00:00.000Z") },
        now,
      ),
      false,
    );
  });

  it("past_due / canceled → false même sans endsAt", () => {
    assert.equal(
      isSubscriptionCommerciallyActive({ status: "past_due", endsAt: null }, now),
      false,
    );
    assert.equal(
      isSubscriptionCommerciallyActive(
        { status: "canceled", endsAt: null },
        now,
      ),
      false,
    );
  });
});
