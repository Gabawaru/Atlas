import fs from "node:fs";
import path from "node:path";
import { ARCHIVE_DIR, sanitizeTaskName } from "./paths.js";

function stamp() {
  return new Date().toISOString();
}

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function appendLine(filePath, line) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, line.endsWith("\n") ? line : `${line}\n`, "utf8");
}

/**
 * Append-only plain-text archive.
 * Writes both a global daily log and a per-task log. Never logs tokens/secrets.
 */
export function archiveEvent({ kind, taskName, detail = "" }) {
  const ts = stamp();
  const task = sanitizeTaskName(taskName || "global");
  const safeDetail = String(detail || "")
    .replace(/\r?\n/g, " ")
    .slice(0, 2000);
  const line = `[${ts}] ${kind} task=${task}${safeDetail ? ` ${safeDetail}` : ""}`;

  appendLine(path.join(ARCHIVE_DIR, `${dayKey()}.log`), line);
  appendLine(path.join(ARCHIVE_DIR, `task-${task}.txt`), line);
  return line;
}

export function listArchiveFiles() {
  if (!fs.existsSync(ARCHIVE_DIR)) return [];
  return fs
    .readdirSync(ARCHIVE_DIR)
    .filter((f) => f.endsWith(".log") || f.endsWith(".txt"))
    .sort()
    .map((name) => {
      const full = path.join(ARCHIVE_DIR, name);
      const st = fs.statSync(full);
      return { name, size: st.size, mtime: st.mtime.toISOString() };
    });
}

export function readArchiveFile(name) {
  const base = path.basename(name);
  if (!/^[\w.\-]+$/.test(base) || !(base.endsWith(".log") || base.endsWith(".txt"))) {
    return null;
  }
  const full = path.join(ARCHIVE_DIR, base);
  if (!fs.existsSync(full)) return null;
  return { name: base, content: fs.readFileSync(full, "utf8") };
}

/** Concatenate all archive files (daily first, then task files) for global download. */
export function readGlobalArchive() {
  const files = listArchiveFiles();
  const parts = [];
  for (const f of files) {
    const body = fs.readFileSync(path.join(ARCHIVE_DIR, f.name), "utf8");
    parts.push(`===== ${f.name} =====\n${body}`);
  }
  return parts.join("\n");
}
