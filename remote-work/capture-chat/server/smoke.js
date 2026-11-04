/**
 * Local smoke: start is assumed external, or we hit a running instance.
 * Usage: CAPTURE_CHAT_TOKEN=test PORT=8787 node server/smoke.js
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const TOKEN = process.env.CAPTURE_CHAT_TOKEN || "smoke-token";
const PORT = Number(process.env.PORT || 8799);
const BASE = `http://127.0.0.1:${PORT}`;

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${TOKEN}`, ...extra };
}

async function waitHealth(ms = 8000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not become healthy");
}

async function main() {
  const dataDir = path.join(root, "data-smoke");
  fs.rmSync(dataDir, { recursive: true, force: true });

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: root,
    env: {
      ...process.env,
      CAPTURE_CHAT_TOKEN: TOKEN,
      PORT: String(PORT),
      DATA_DIR: dataDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let out = "";
  child.stdout.on("data", (d) => {
    out += d.toString();
  });
  child.stderr.on("data", (d) => {
    out += d.toString();
  });

  try {
    await waitHealth();

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const form = new FormData();
    form.append("taskName", "smoke-task");
    form.append("file", new Blob([png], { type: "image/png" }), "shot.png");

    const cap = await fetch(`${BASE}/api/captures`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    if (!cap.ok) throw new Error(`capture failed: ${cap.status} ${await cap.text()}`);
    const saved = await cap.json();
    if (!saved.filename?.includes("smoke-task")) {
      throw new Error(`bad filename: ${saved.filename}`);
    }

    const chat = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        author: "gab",
        text: "terminal paste: ls -la",
      }),
    });
    if (!chat.ok) throw new Error(`chat failed: ${chat.status}`);

    const reply = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        author: "coordinator",
        text: "OK, j'ai vérifié",
      }),
    });
    if (!reply.ok) throw new Error(`reply failed: ${reply.status}`);

    const archive = await fetch(`${BASE}/api/archive.txt`, {
      headers: authHeaders(),
    });
    if (!archive.ok) throw new Error(`archive failed: ${archive.status}`);
    const text = await archive.text();
    for (const needle of ["CAPTURE", "CHAT", "TASK_CREATE", "smoke-task"]) {
      if (!text.includes(needle)) {
        throw new Error(`archive missing ${needle}:\n${text}`);
      }
    }

    const done = await fetch(`${BASE}/api/mark-task-done`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ taskName: "smoke-task" }),
    });
    if (!done.ok) throw new Error(`done failed: ${done.status}`);
    const doneBody = await done.json();
    if (!doneBody.deleted?.length) throw new Error("expected deleted files");

    const archive2 = await fetch(`${BASE}/archive.txt`, {
      headers: authHeaders(),
    });
    const text2 = await archive2.text();
    if (!text2.includes("TASK_DONE") || !text2.includes("TASK_DELETE")) {
      throw new Error(`archive missing done/delete:\n${text2}`);
    }

    const tasks = await fetch(`${BASE}/api/captures`, {
      headers: authHeaders(),
    });
    const list = await tasks.json();
    if (list.tasks.some((t) => t.taskName === "smoke-task")) {
      throw new Error("task captures should be recycled");
    }

    console.log("SMOKE_OK");
  } finally {
    child.kill("SIGTERM");
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("SMOKE_FAIL", err);
  process.exit(1);
});
