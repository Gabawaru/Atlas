import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SESSION_TRACE_SEED } from "./sessionTrace";
import {
  LIVE_TRACE_STORAGE_KEY,
  appendLiveTrace,
  appendRedirectTrace,
  appendReportAvailable,
  appendScanOutcome,
  appendScanStarted,
  refusedScanJournalArgs,
  loadLiveTrace,
  mergeSeedAndLive,
} from "./sessionTraceLive";

class MemStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

describe("sessionTraceLive", () => {
  it("append + load + dedupe by id", () => {
    const s = new MemStorage() as unknown as Storage;
    appendLiveTrace(
      { id: "x1", role: "agent", text: "un", details: { done: ["a"] } },
      s,
    );
    appendLiveTrace({ id: "x1", role: "agent", text: "dup", details: {} }, s);
    const list = loadLiveTrace(s);
    assert.equal(list.length, 1);
    assert.equal(list[0]!.text, "un");
    assert.ok(s.getItem(LIVE_TRACE_STORAGE_KEY)?.includes("x1"));
  });

  it("mergeSeedAndLive sorts and unions", () => {
    const seed = SESSION_TRACE_SEED.slice(0, 1);
    const live = [
      {
        id: "live-z",
        role: "agent" as const,
        text: "live",
        at: "2099-01-01T00:00:00.000Z",
        details: {},
      },
    ];
    const merged = mergeSeedAndLive(seed, live);
    assert.ok(merged.length >= 2);
    assert.equal(merged[merged.length - 1]!.id, "live-z");
  });

  it("refuse CTA journalise avant POST (RoE / liability)", () => {
    const s = new MemStorage() as unknown as Storage;
    const args = refusedScanJournalArgs(
      "evil.com",
      "Cible hors RoE (*.pragma-serve.com, *.pragma-cloud.com, *.pragma.mc).",
    );
    assert.equal(args.missionId, "refused");
    assert.equal(args.ok, false);
    assert.equal(args.host, "evil.com");
    const msg = appendScanOutcome(args, s);
    assert.match(msg.text, /bloqué/);
    assert.match(msg.text, /evil\.com/);
    assert.match(msg.details?.reasons?.join(" ") ?? "", /hors RoE/i);
  });

  it("scan / report / redirect helpers shape ids", () => {
    const s = new MemStorage() as unknown as Storage;
    const start = appendScanStarted("example.com", s);
    assert.equal(start.role, "prompt");
    assert.match(start.text, /example.com/);

    const ok = appendScanOutcome(
      {
        host: "example.com",
        missionId: "m1",
        ok: true,
        detail: "EXECUTED",
      },
      s,
    );
    assert.equal(ok.id, "scan-ok-m1");
    assert.equal(ok.role, "agent");

    const fail = appendScanOutcome(
      {
        host: "example.com",
        missionId: "m2",
        ok: false,
        detail: "REJECT reason",
        gateCode: "ROE",
      },
      s,
    );
    assert.match(fail.text, /bloqué/);

    const r = appendReportAvailable(
      {
        missionId: "cmw1",
        reportId: "rep1",
        host: "pragma-serve.com",
      },
      s,
    );
    assert.equal(r.id, "report-rep1");

    const d = appendRedirectTrace(
      {
        id: "redir-abc",
        message: "Priorité scan",
        api: "ok",
      },
      s,
    );
    assert.equal(d.id, "redir-abc");
    assert.equal(d.role, "prompt");
  });

  it("smoke: scan flow lands in mergeSeedAndLive for journal", () => {
    const s = new MemStorage() as unknown as Storage;
    appendScanStarted("pragma-serve.com", s);
    appendScanOutcome(
      {
        host: "pragma-serve.com",
        missionId: "cmw-smoke",
        ok: true,
        detail: "EXECUTED",
      },
      s,
    );
    appendReportAvailable(
      {
        missionId: "cmw-smoke",
        reportId: "rep-smoke",
        host: "pragma-serve.com",
      },
      s,
    );
    const live = loadLiveTrace(s);
    const merged = mergeSeedAndLive(SESSION_TRACE_SEED, live);
    assert.ok(live.some((m) => m.text.includes("Scan demandé")));
    assert.ok(live.some((m) => m.id === "scan-ok-cmw-smoke"));
    assert.ok(live.some((m) => m.id === "report-rep-smoke"));
    assert.ok(merged.length > SESSION_TRACE_SEED.length);
  });
});
