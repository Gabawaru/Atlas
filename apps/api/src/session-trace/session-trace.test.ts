import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { appendTenantTrace, readTenantTrace } from "./session-trace.store";
import { SessionTraceService } from "./session-trace.service";
import { isSessionTraceMessage } from "./session-trace.types";

describe("session-trace store (file-backed)", () => {
  it("append + dedupe + read", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "atlas-trace-"));
    const msg = {
      id: "live-1",
      role: "agent" as const,
      text: "Scan OK — example.com",
      at: "2026-11-10T18:00:00.000Z",
      details: { done: ["mission m1"] },
    };
    const a = await appendTenantTrace("tenant-a", msg, root);
    assert.equal(a.added, true);
    const dup = await appendTenantTrace("tenant-a", msg, root);
    assert.equal(dup.added, false);
    const list = await readTenantTrace("tenant-a", root);
    assert.equal(list.length, 1);
    assert.equal(list[0]!.id, "live-1");
    const other = await readTenantTrace("tenant-b", root);
    assert.equal(other.length, 0);
    const raw = await readFile(path.join(root, "tenant-a.json"), "utf8");
    assert.ok(raw.includes("live-1"));
  });

  it("isSessionTraceMessage rejects junk", () => {
    assert.equal(isSessionTraceMessage(null), false);
    assert.equal(isSessionTraceMessage({ id: "x" }), false);
    assert.ok(
      isSessionTraceMessage({
        id: "x",
        role: "prompt",
        text: "hi",
        at: "2026-11-10T00:00:00.000Z",
        details: {},
      }),
    );
  });

  it("service rejects invalid body", async () => {
    const svc = new SessionTraceService();
    await assert.rejects(() => svc.append("t1", { id: "nope" }), /invalide/);
  });
});
