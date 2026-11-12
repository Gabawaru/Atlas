import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SupportTrackingService } from "./support-tracking.service";

describe("support-tracking soft twin + opaque session", () => {
  let prevDir: string | undefined;
  let root: string;
  let svc: SupportTrackingService;

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), "atlas-support-"));
    prevDir = process.env.ATLAS_SUPPORT_TRACKING_DIR;
    process.env.ATLAS_SUPPORT_TRACKING_DIR = root;
    svc = new SupportTrackingService();
  });

  after(async () => {
    if (prevDir === undefined) delete process.env.ATLAS_SUPPORT_TRACKING_DIR;
    else process.env.ATLAS_SUPPORT_TRACKING_DIR = prevDir;
    await rm(root, { recursive: true, force: true });
  });

  it("createSoftHandoff returns opaque id and tables without PII", async () => {
    const snap = await svc.createSoftHandoff({
      source: "atlas-secu-pages",
      ticket: { subject: "Prise en charge Pragma", status: "ouvert" },
    });
    assert.match(snap.supportSessionId, /^sup_/);
    assert.ok(snap.tickets.length >= 1);
    assert.ok(snap.vulns.length >= 1);
    assert.ok(snap.progress.length >= 1);
    const raw = JSON.stringify(snap);
    assert.equal(/email|firstName|password/i.test(raw), false);
  });

  it("GET collections via opaque id (multi-device)", async () => {
    const snap = await svc.createSoftHandoff({ source: "test" });
    const tickets = await svc.listTickets(snap.supportSessionId);
    const vulns = await svc.listVulns(snap.supportSessionId);
    const progress = await svc.listProgress(snap.supportSessionId);
    assert.equal(tickets.items.length, snap.tickets.length);
    assert.equal(vulns.items.length, snap.vulns.length);
    assert.equal(progress.items.length, snap.progress.length);
  });

  it("ingestVulns merges scanner opt-in findings after handoff", async () => {
    const snap = await svc.createSoftHandoff({ source: "test" });
    const next = await svc.ingestVulns(snap.supportSessionId, [
      {
        id: "CCV-AAAAA",
        title: "Header HSTS absent",
        risk: "moyen",
        fingerprint: "hsts|https://ex/",
      },
      {
        id: "CCV-BBBBB",
        title: "Header HSTS absent",
        risk: "moyen",
        fingerprint: "hsts|https://ex/",
      },
    ]);
    const hsts = next.vulns.filter((v) => v.fingerprint === "hsts|https://ex/");
    assert.equal(hsts.length, 1);
    assert.ok(next.progress.some((p) => /scanner/i.test(p.label)));
  });

  it("missing session → error", async () => {
    await assert.rejects(() => svc.listTickets(""), /X-Atlas-Support-Session/);
    await assert.rejects(
      () => svc.listTickets("sup_does_not_exist"),
      /introuvable/,
    );
  });
});
