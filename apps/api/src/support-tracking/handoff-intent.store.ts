/**
 * File-backed handoff intents — one JSON per opaque handoffIntentId.
 * Same root as support sessions (ATLAS_SUPPORT_TRACKING_DIR)/intents.
 */
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { supportTrackingDir } from "./support-tracking.store";
import {
  isHandoffIntentRecord,
  type HandoffIntentRecord,
} from "./handoff-intent.types";

export const HANDOFF_INTENT_TTL_MS = 15 * 60 * 1000;

export function handoffIntentsDir(root?: string): string {
  return path.join(supportTrackingDir(root), "intents");
}

export function newHandoffIntentId(): string {
  return `hin_${randomBytes(18).toString("base64url")}`;
}

function safeIntentFile(handoffIntentId: string, root?: string): string {
  const safe = handoffIntentId
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 120);
  return path.join(handoffIntentsDir(root), `${safe || "unknown"}.json`);
}

export async function readHandoffIntent(
  handoffIntentId: string,
  root?: string,
): Promise<HandoffIntentRecord | null> {
  try {
    const raw = await readFile(safeIntentFile(handoffIntentId, root), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isHandoffIntentRecord(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeHandoffIntent(
  rec: HandoffIntentRecord,
  root?: string,
): Promise<HandoffIntentRecord> {
  const dir = handoffIntentsDir(root);
  await mkdir(dir, { recursive: true });
  await writeFile(
    safeIntentFile(rec.handoffIntentId, root),
    JSON.stringify(rec),
    "utf8",
  );
  return rec;
}

/** Find open PC awaiting_confirm intent for source (idempotent create). */
export async function findOpenPcIntentBySource(
  source: string,
  nowMs = Date.now(),
  root?: string,
): Promise<HandoffIntentRecord | null> {
  try {
    const files = await readdir(handoffIntentsDir(root));
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const rec = await readHandoffIntent(f.replace(/\.json$/, ""), root);
      if (!rec) continue;
      if (rec.source !== source) continue;
      if (rec.status !== "awaiting_confirm") continue;
      if (Date.parse(rec.expiresAt) <= nowMs) continue;
      return rec;
    }
  } catch {
    /* empty dir */
  }
  return null;
}
