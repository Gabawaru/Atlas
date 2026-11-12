import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  appendNotification,
  ensureSeededInbox,
  markNotificationRead,
  readInbox,
} from "./notifications.store";
import { NotificationsService } from "./notifications.service";
import {
  GAB_NOTIFICATION_SEED,
  isGabNotification,
} from "./notifications.types";

describe("notifications store (file-backed)", () => {
  it("seeds from RoE report shape when empty", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "atlas-notif-"));
    const list = await ensureSeededInbox(root);
    assert.equal(list.length, GAB_NOTIFICATION_SEED.length);
    assert.ok(list.every(isGabNotification));
    assert.ok(list.some((n) => n.needsBen));
    const raw = await readFile(path.join(root, "gab-inbox.json"), "utf8");
    assert.ok(raw.includes("Verdict") || raw.includes("verdict") || raw.includes("§3"));
  });

  it("append + dedupe + mark read", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "atlas-notif-"));
    await ensureSeededInbox(root);
    const item = {
      id: "gab-test-1",
      source: "gab" as const,
      at: "2026-11-12T16:00:00.000Z",
      title: "Besoin de toi",
      verdict: "Bloqué — accès manquant",
      faits: "Pas de token Pages.",
      bloquants: "Gabawaru session humaine requise",
      next: "coller TXT",
      read: false,
      needsBen: true,
    };
    const a = await appendNotification(item, root);
    assert.equal(a.added, true);
    const dup = await appendNotification(item, root);
    assert.equal(dup.added, false);
    const marked = await markNotificationRead("gab-test-1", root);
    assert.equal(marked?.read, true);
    const list = await readInbox(root);
    assert.ok(list.some((n) => n.id === "gab-test-1" && n.read));
  });

  it("service rejects missing fields", async () => {
    const svc = new NotificationsService();
    await assert.rejects(
      () => svc.create({ verdict: "x", faits: "", bloquants: "y" }),
      /requis/,
    );
  });

  it("service infers needsBen from bloquants", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "atlas-notif-svc-"));
    process.env.ATLAS_NOTIFICATIONS_DIR = root;
    try {
      const svc = new NotificationsService();
      const idle = await svc.create({
        id: "svc-idle",
        verdict: "ok",
        faits: "rien",
        bloquants: "aucun",
      });
      assert.equal(idle.notification.needsBen, false);
      const blocked = await svc.create({
        id: "svc-block",
        verdict: "stop",
        faits: "manque OK",
        bloquants: "décision Ben requise",
      });
      assert.equal(blocked.notification.needsBen, true);
    } finally {
      delete process.env.ATLAS_NOTIFICATIONS_DIR;
    }
  });
});
