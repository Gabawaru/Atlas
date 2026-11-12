/**
 * File-backed Gab→Ben notifications inbox.
 * Musk-minimal: one JSON array under storage/; no Prisma.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  GAB_NOTIFICATION_SEED,
  NOTIFICATIONS_MAX,
  isGabNotification,
  type GabNotification,
} from "./notifications.types";

export function notificationsDir(
  root = process.env.ATLAS_NOTIFICATIONS_DIR?.trim() ||
    path.join(process.cwd(), "storage", "notifications"),
): string {
  return root;
}

function inboxFile(root?: string): string {
  return path.join(notificationsDir(root), "gab-inbox.json");
}

export async function readInbox(root?: string): Promise<GabNotification[]> {
  try {
    const raw = await readFile(inboxFile(root), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isGabNotification).slice(-NOTIFICATIONS_MAX);
  } catch {
    return [];
  }
}

async function writeInbox(
  items: GabNotification[],
  root?: string,
): Promise<void> {
  const dir = notificationsDir(root);
  await mkdir(dir, { recursive: true });
  await writeFile(
    inboxFile(root),
    JSON.stringify(items.slice(-NOTIFICATIONS_MAX)),
    "utf8",
  );
}

/** First read seeds from RoE report shape when the inbox file is missing/empty. */
export async function ensureSeededInbox(
  root?: string,
): Promise<GabNotification[]> {
  const existing = await readInbox(root);
  if (existing.length > 0) return existing;
  await writeInbox(GAB_NOTIFICATION_SEED, root);
  return [...GAB_NOTIFICATION_SEED];
}

export async function appendNotification(
  item: GabNotification,
  root?: string,
): Promise<{ notification: GabNotification; added: boolean }> {
  const prev = await ensureSeededInbox(root);
  if (prev.some((n) => n.id === item.id)) {
    return { notification: item, added: false };
  }
  const next = [...prev, item].slice(-NOTIFICATIONS_MAX);
  await writeInbox(next, root);
  return { notification: item, added: true };
}

export async function markNotificationRead(
  id: string,
  root?: string,
): Promise<GabNotification | null> {
  const prev = await ensureSeededInbox(root);
  const idx = prev.findIndex((n) => n.id === id);
  if (idx < 0) return null;
  const updated: GabNotification = { ...prev[idx]!, read: true };
  const next = [...prev];
  next[idx] = updated;
  await writeInbox(next, root);
  return updated;
}

export async function getNotification(
  id: string,
  root?: string,
): Promise<GabNotification | null> {
  const list = await ensureSeededInbox(root);
  return list.find((n) => n.id === id) ?? null;
}
