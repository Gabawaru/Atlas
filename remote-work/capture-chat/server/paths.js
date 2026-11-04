import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

export const ROOT = root;
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(root, "data");
export const CAPTURES_DIR = path.join(DATA_DIR, "captures");
export const CHAT_DIR = path.join(DATA_DIR, "chat");
export const ARCHIVE_DIR = path.join(DATA_DIR, "archive");
export const CHAT_FILE = path.join(CHAT_DIR, "messages.json");
export const PUBLIC_DIR = path.join(root, "public");

export function ensureDirs() {
  for (const dir of [DATA_DIR, CAPTURES_DIR, CHAT_DIR, ARCHIVE_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(CHAT_FILE)) {
    fs.writeFileSync(CHAT_FILE, "[]\n", "utf8");
  }
}

/** Sanitize a task name into a safe folder/file stem. */
export function sanitizeTaskName(raw) {
  const s = String(raw || "")
    .trim()
    .replace(/[^\w.\- @()+]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  return s || "untitled";
}
