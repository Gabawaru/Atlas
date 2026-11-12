import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatNotifTime,
  notificationsPollMs,
} from "./notifications";

describe("notifications helpers", () => {
  it("poll interval is near-realtime (5–15s)", () => {
    const ms = notificationsPollMs();
    assert.ok(ms >= 5_000 && ms <= 15_000);
  });

  it("formatNotifTime returns fr-FR-ish string", () => {
    const s = formatNotifTime("2026-11-12T14:15:19.000Z");
    assert.ok(typeof s === "string" && s.length > 4);
  });
});
