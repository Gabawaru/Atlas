import fs from "node:fs";
import path from "node:path";
import express from "express";
import multer from "multer";
import {
  ensureDirs,
  PUBLIC_DIR,
  CAPTURES_DIR,
  CHAT_DIR,
  sanitizeTaskName,
} from "./paths.js";
import {
  listTasks,
  saveCapture,
  markTaskDone,
  readChat,
  appendChat,
  taskDir,
} from "./store.js";
import {
  archiveEvent,
  listArchiveFiles,
  readArchiveFile,
  readGlobalArchive,
} from "./archive.js";

ensureDirs();

const TOKEN = process.env.CAPTURE_CHAT_TOKEN || "";
const PORT = Number(process.env.PORT || 8787);

if (!TOKEN) {
  console.warn(
    "[capture-chat] WARNING: CAPTURE_CHAT_TOKEN is empty — set it in .env before exposing the service.",
  );
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function requireAuth(req, res, next) {
  if (!TOKEN) {
    return res.status(503).json({
      error: "Server misconfigured: CAPTURE_CHAT_TOKEN not set",
    });
  }
  const header = req.get("authorization") || "";
  const queryToken = typeof req.query.token === "string" ? req.query.token : "";
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  const got = bearer || queryToken || req.get("x-capture-token") || "";
  if (got !== TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "capture-chat" });
});

app.use(express.static(PUBLIC_DIR));

// --- Captures ---
app.post("/api/captures", requireAuth, upload.single("file"), (req, res) => {
  const taskName = req.body?.taskName || req.body?.task || "";
  if (!taskName.trim()) {
    return res.status(400).json({ error: "taskName required" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "file required (multipart field: file)" });
  }
  const task = sanitizeTaskName(taskName);
  const dir = taskDir(task);
  const isNew = !fs.existsSync(dir) || fs.readdirSync(dir).length === 0;
  if (isNew) {
    archiveEvent({ kind: "TASK_CREATE", taskName: task, detail: "first_capture" });
  }
  const saved = saveCapture({
    taskName: task,
    originalName: req.file.originalname,
    buffer: req.file.buffer,
  });
  return res.status(201).json(saved);
});

app.get("/api/captures", requireAuth, (_req, res) => {
  res.json({ tasks: listTasks() });
});

app.get("/api/captures/:taskName/:filename", requireAuth, (req, res) => {
  const task = sanitizeTaskName(req.params.taskName);
  const filename = path.basename(req.params.filename);
  const full = path.join(CAPTURES_DIR, task, filename);
  if (!full.startsWith(path.join(CAPTURES_DIR, task)) || !fs.existsSync(full)) {
    return res.status(404).json({ error: "Not found" });
  }
  return res.sendFile(full);
});

app.post("/api/tasks/:taskName/done", requireAuth, (req, res) => {
  const result = markTaskDone(req.params.taskName);
  res.json({ ok: true, ...result });
});

app.post("/api/mark-task-done", requireAuth, (req, res) => {
  const taskName = req.body?.taskName || req.query.taskName;
  if (!taskName) return res.status(400).json({ error: "taskName required" });
  const result = markTaskDone(taskName);
  res.json({ ok: true, ...result });
});

// --- Chat ---
app.get("/api/chat", requireAuth, (_req, res) => {
  res.json({ messages: readChat() });
});

app.post(
  "/api/chat",
  requireAuth,
  upload.single("image"),
  (req, res) => {
    const author = req.body?.author || "gab";
    const text = req.body?.text || "";
    if (!text.trim() && !req.file) {
      return res.status(400).json({ error: "text or image required" });
    }
    let imageName = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname || "") || ".png";
      imageName = `chat-${Date.now()}${ext}`;
      const dest = path.join(CHAT_DIR, "images");
      fs.mkdirSync(dest, { recursive: true });
      fs.writeFileSync(path.join(dest, imageName), req.file.buffer);
    }
    const msg = appendChat({ author, text, imageName });
    return res.status(201).json(msg);
  },
);

app.get("/api/chat/images/:name", requireAuth, (req, res) => {
  const name = path.basename(req.params.name);
  const full = path.join(CHAT_DIR, "images", name);
  if (!fs.existsSync(full)) return res.status(404).json({ error: "Not found" });
  return res.sendFile(full);
});

// --- Archive (textual full traceability) ---
app.get("/api/archive", requireAuth, (_req, res) => {
  res.json({ files: listArchiveFiles() });
});

app.get("/api/archive.txt", requireAuth, (_req, res) => {
  const body = readGlobalArchive();
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="capture-chat-archive.txt"',
  );
  res.send(body || "# empty archive\n");
});

app.get("/archive.txt", requireAuth, (_req, res) => {
  const body = readGlobalArchive();
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="capture-chat-archive.txt"',
  );
  res.send(body || "# empty archive\n");
});

app.get("/api/archive/:name", requireAuth, (req, res) => {
  const file = readArchiveFile(req.params.name);
  if (!file) return res.status(404).json({ error: "Not found" });
  const wantsDownload =
    req.query.download === "1" || req.query.download === "true";
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  if (wantsDownload) {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.name}"`,
    );
  }
  res.send(file.content);
});

app.get("/archive", requireAuth, (_req, res) => {
  res.redirect("/#archive");
});

app.listen(PORT, () => {
  console.log(`[capture-chat] listening on http://127.0.0.1:${PORT}`);
  console.log(`[capture-chat] data dir: ${path.resolve(process.env.DATA_DIR || "data")}`);
});
