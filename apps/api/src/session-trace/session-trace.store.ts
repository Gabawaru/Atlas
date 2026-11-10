/**
 * File-backed Gabriel journal — one JSON array per tenant under storage/.
 * Musk-minimal: no Prisma table; survives API restarts; shared across devices
 * that hit the same API.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  SESSION_TRACE_MAX,
  isSessionTraceMessage,
  type SessionTraceMessage,
} from "./session-trace.types";

export function sessionTraceDir(
  root = process.env.ATLAS_SESSION_TRACE_DIR?.trim() ||
    path.join(process.cwd(), "storage", "session-trace"),
): string {
  return root;
}

function safeTenantFile(tenantId: string, root?: string): string {
  const safe = tenantId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
  return path.join(sessionTraceDir(root), `${safe || "unknown"}.json`);
}

export async function readTenantTrace(
  tenantId: string,
  root?: string,
): Promise<SessionTraceMessage[]> {
  try {
    const raw = await readFile(safeTenantFile(tenantId, root), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSessionTraceMessage).slice(-SESSION_TRACE_MAX);
  } catch {
    return [];
  }
}

export async function appendTenantTrace(
  tenantId: string,
  msg: SessionTraceMessage,
  root?: string,
): Promise<{ message: SessionTraceMessage; added: boolean }> {
  const dir = sessionTraceDir(root);
  await mkdir(dir, { recursive: true });
  const prev = await readTenantTrace(tenantId, root);
  if (prev.some((m) => m.id === msg.id)) {
    return { message: msg, added: false };
  }
  const next = [...prev, msg].slice(-SESSION_TRACE_MAX);
  await writeFile(
    safeTenantFile(tenantId, root),
    JSON.stringify(next),
    "utf8",
  );
  return { message: msg, added: true };
}
