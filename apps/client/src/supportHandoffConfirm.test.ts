import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORT_HANDOFF_C1_PROMPT,
  gateSupportHandoffC1,
  isPhoneLikeDevice,
} from "./supportHandoffConfirm";

describe("supportHandoffConfirm C1", () => {
  it("isPhoneLikeDevice fail-closed: empty UA = phone", () => {
    assert.equal(isPhoneLikeDevice(""), true);
    assert.equal(isPhoneLikeDevice(null), true);
    assert.equal(isPhoneLikeDevice(undefined), true);
  });

  it("isPhoneLikeDevice detects mobile UA", () => {
    assert.equal(
      isPhoneLikeDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      ),
      true,
    );
    assert.equal(
      isPhoneLikeDevice("Mozilla/5.0 (Linux; Android 14) Mobile"),
      true,
    );
  });

  it("desktop UA is not phone", () => {
    assert.equal(
      isPhoneLikeDevice(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      ),
      false,
    );
  });

  it("phone → blocked, no confirmFn call", () => {
    let called = false;
    const r = gateSupportHandoffC1({
      userAgent: "iPhone",
      confirmFn: () => {
        called = true;
        return true;
      },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "phone_blocked");
    assert.equal(called, false);
  });

  it("PC cancel → cancelled", () => {
    const r = gateSupportHandoffC1({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      confirmFn: (msg) => {
        assert.equal(msg, SUPPORT_HANDOFF_C1_PROMPT);
        return false;
      },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "cancelled");
  });

  it("PC confirm → pcConfirmedAt", () => {
    const r = gateSupportHandoffC1({
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      confirmFn: () => true,
      now: () => "2026-11-12T16:00:00.000Z",
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.pcConfirmedAt, "2026-11-12T16:00:00.000Z");
  });
});
