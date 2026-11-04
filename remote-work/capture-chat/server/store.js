import fs from "node:fs";
import path from "node:path";
import {
  CAPTURES_DIR,
  CHAT_FILE,
  sanitizeTaskName,
} from "./paths.js";
import { archiveEvent } from "./archive.js";

export function taskDir(taskName) {
  return path.join(CAPTURES_DIR, sanitizeTaskName(taskName));
}

export function listTasks() {
  if (!fs.existsSync(CAPTURES_DIR)) return [];
  return fs
    .readdirSync(CAPTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const dir = path.join(CAPTURES_DIR, d.name);
      const files = fs
        .readdirSync(dir)
        .filter((f) => !f.startsWith("."))
        .map((name) => {
          const st = fs.statSync(path.join(dir, name));
          return {
            name,
            size: st.size,
            mtime: st.mtime.toISOString(),
            url: `/api/captures/${encodeURIComponent(d.name)}/${encodeURIComponent(name)}`,
          };
        });
      return { taskName: d.name, captures: files };
    })
    .sort((a, b) => a.taskName.localeCompare(b.taskName));
}

export function saveCapture({ taskName, originalName, buffer }) {
  const task = sanitizeTaskName(taskName);
  const dir = taskDir(task);
  fs.mkdirSync(dir, { recursive: true });

  const ext = path.extname(originalName || "") || ".png";
  const base = path
    .basename(originalName || "capture", ext)
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 60);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${task}__${stamp}__${base}${ext}`;
  const dest = path.join(dir, filename);
  fs.writeFileSync(dest, buffer);

  archiveEvent({
    kind: "CAPTURE",
    taskName: task,
    detail: `file=${filename} bytes=${buffer.length}`,
  });

  // First capture for a brand-new task folder → task create event already implied;
  // emit explicit CREATE only when the directory was empty before this write.
  return {
    taskName: task,
    filename,
    bytes: buffer.length,
    url: `/api/captures/${encodeURIComponent(task)}/${encodeURIComponent(filename)}`,
  };
}

export function markTaskDone(taskName) {
  const task = sanitizeTaskName(taskName);
  const dir = taskDir(task);
  let deleted = [];
  if (fs.existsSync(dir)) {
    deleted = fs.readdirSync(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  archiveEvent({
    kind: "TASK_DONE",
    taskName: task,
    detail: `deleted_files=${deleted.length} names=${deleted.join(",") || "-"}`,
  });
  archiveEvent({
    kind: "TASK_DELETE",
    taskName: task,
    detail: "captures_recycled",
  });
  return { taskName: task, deleted };
}

export function readChat() {
  try {
    const raw = fs.readFileSync(CHAT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendChat({ author, text, imageName = null }) {
  const messages = readChat();
  const msg = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    author: String(author || "anon").slice(0, 64),
    text: String(text || "").slice(0, 20000),
    imageName: imageName || null,
    imageUrl: imageName
      ? `/api/chat/images/${encodeURIComponent(imageName)}`
      : null,
  };
  messages.push(msg);
  fs.writeFileSync(CHAT_FILE, `${JSON.stringify(messages, null, 2)}\n`, "utf8");
  archiveEvent({
    kind: "CHAT",
    taskName: "chat",
    detail: `author=${msg.author} id=${msg.id}${imageName ? ` image=${imageName}` : ""} text=${JSON.stringify(msg.text).slice(0, 500)}`,
  });
  return msg;
}
