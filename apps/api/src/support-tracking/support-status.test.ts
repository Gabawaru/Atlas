import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  publicStatusActive,
  publicStatusAwaitingConfirm,
  publicStatusNone,
} from "./support-status";

describe("support public status", () => {
  it("none exposes C1 + phone block flag", () => {
    const s = publicStatusNone();
    assert.equal(s.handoff, "none");
    assert.equal(s.c1Required, true);
    assert.equal(s.phoneToPc, "blocked_until_ATLAS_API_BASE");
    assert.equal(s.supportSessionId, undefined);
  });

  it("awaiting_confirm exposes intent id", () => {
    const s = publicStatusAwaitingConfirm({
      handoffIntentId: "hin_x",
      createdAt: "2026-11-12T16:00:00.000Z",
      expiresAt: "2026-11-12T16:15:00.000Z",
    });
    assert.equal(s.handoff, "awaiting_confirm");
    assert.equal(s.handoffIntentId, "hin_x");
  });

  it("active counts without PII keys", () => {
    const s = publicStatusActive({
      supportSessionId: "sup_abc",
      requestedAt: "2026-11-12T16:00:00.000Z",
      ticketCount: 1,
      vulnCount: 2,
      progressCount: 1,
    });
    assert.equal(s.handoff, "active");
    assert.equal(s.supportSessionId, "sup_abc");
    assert.equal(s.ticketCount, 1);
    assert.equal(/email|firstName/i.test(JSON.stringify(s)), false);
  });
});
