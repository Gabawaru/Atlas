/**
 * File-backed support sessions — one JSON file per opaque supportSessionId.
 * Survives API restarts; shared across devices that hit the same API + id.
 * Musk-minimal: no Prisma table for the soft twin.
 */
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  isSupportSessionRecord,
  type SupportSessionRecord,
} from "./support-tracking.types";

export function supportTrackingDir(
  root = process.env.ATLAS_SUPPORT_TRACKING_DIR?.trim() ||
    path.join(process.cwd(), "storage", "support-tracking"),
): string {
  return root;
}

export function newSupportSessionId(): string {
  return `sup_${randomBytes(18).toString("base64url")}`;
}

function safeSessionFile(supportSessionId: string, root?: string): string {
  const safe = supportSessionId
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 120);
  return path.join(supportTrackingDir(root), `${safe || "unknown"}.json`);
}

export async function readSupportSession(
  supportSessionId: string,
  root?: string,
): Promise<SupportSessionRecord | null> {
  try {
    const raw = await readFile(safeSessionFile(supportSessionId, root), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isSupportSessionRecord(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeSupportSession(
  rec: SupportSessionRecord,
  root?: string,
): Promise<SupportSessionRecord> {
  const dir = supportTrackingDir(root);
  await mkdir(dir, { recursive: true });
  await writeFile(
    safeSessionFile(rec.supportSessionId, root),
    JSON.stringify(rec),
    "utf8",
  );
  return rec;
}

/** Test helper — list session ids under a root (capped). */
export async function listSupportSessionIds(
  root?: string,
  limit = 50,
): Promise<string[]> {
  try {
    const files = await readdir(supportTrackingDir(root));
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .slice(0, limit);
  } catch {
    return [];
  }
}
