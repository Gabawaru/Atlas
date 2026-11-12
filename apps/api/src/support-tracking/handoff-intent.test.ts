import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SupportTrackingService } from "./support-tracking.service";

describe("handoff intent + confirm (PC-only coherent slice)", () => {
  let prevDir: string | undefined;
  let root: string;
  let svc: SupportTrackingService;
  const now = Date.parse("2026-11-12T17:00:00.000Z");

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), "atlas-intent-"));
    prevDir = process.env.ATLAS_SUPPORT_TRACKING_DIR;
    process.env.ATLAS_SUPPORT_TRACKING_DIR = root;
    svc = new SupportTrackingService();
  });

  after(async () => {
    if (prevDir === undefined) delete process.env.ATLAS_SUPPORT_TRACKING_DIR;
    else process.env.ATLAS_SUPPORT_TRACKING_DIR = prevDir;
    await rm(root, { recursive: true, force: true });
  });

  it("createPcIntent → awaiting_confirm opaque id", async () => {
    const snap = await svc.createPcIntent({
      source: "pages-test",
      ticket: { subject: "Prise en charge" },
      nowMs: now,
    });
    assert.match(snap.handoffIntentId, /^hin_/);
    assert.equal(snap.status, "awaiting_confirm");
    assert.equal(snap.initiatedFrom, "pc");
    assert.equal(snap.phoneToPc, "blocked_until_ATLAS_API_BASE");
    assert.equal(snap.c1Required, true);
  });

  it("idempotent create same source while awaiting", async () => {
    const a = await svc.createPcIntent({ source: "idem-src", nowMs: now });
    const b = await svc.createPcIntent({ source: "idem-src", nowMs: now + 1000 });
    assert.equal(a.handoffIntentId, b.handoffIntentId);
  });

  it("confirm with pcConfirmedAt → soft session once", async () => {
    const intent = await svc.createPcIntent({
      source: "confirm-src",
      nowMs: now,
    });
    const first = await svc.confirmPcIntent({
      handoffIntentId: intent.handoffIntentId,
      pcConfirmedAt: "2026-11-12T16:55:00.000Z",
      nowMs: now,
    });
    assert.equal(first.intent.status, "active");
    assert.match(first.session.supportSessionId, /^sup_/);
    assert.equal(first.already, undefined);

    const second = await svc.confirmPcIntent({
      handoffIntentId: intent.handoffIntentId,
      pcConfirmedAt: "2026-11-12T16:56:00.000Z",
      nowMs: now,
    });
    assert.equal(second.already, true);
    assert.equal(
      second.session.supportSessionId,
      first.session.supportSessionId,
    );
  });

  it("confirm without C1 → refuse", async () => {
    const intent = await svc.createPcIntent({
      source: "no-c1",
      nowMs: now,
    });
    await assert.rejects(
      () =>
        svc.confirmPcIntent({
          handoffIntentId: intent.handoffIntentId,
          nowMs: now,
        }),
      /C1/,
    );
  });

  it("expired intent → refuse", async () => {
    const intent = await svc.createPcIntent({
      source: "expire-src",
      nowMs: now,
    });
    const later = now + 16 * 60 * 1000;
    await assert.rejects(
      () =>
        svc.confirmPcIntent({
          handoffIntentId: intent.handoffIntentId,
          /* C1 timestamp valid relative to `later`, but intent TTL already passed */
          pcConfirmedAt: new Date(later - 60_000).toISOString(),
          nowMs: later,
        }),
      /expir/i,
    );
  });
});
