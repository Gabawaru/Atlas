const $ = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.json) headers["Content-Type"] = "application/json";
  const res = await fetch(path, {
    ...opts,
    credentials: "same-origin",
    headers,
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${body}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

async function ensureSession() {
  try {
    const data = await api("/api/session");
    $("session-email").textContent = data.email || "—";
  } catch {
    window.location.href = "/login";
  }
}

$("logout").addEventListener("click", async () => {
  try {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
  } finally {
    window.location.href = "/login";
  }
});

$("chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const author = $("author").value.trim() || "gab";
  const text = $("text").value;
  const file = $("image").files[0];
  try {
    if (file) {
      const fd = new FormData();
      fd.append("author", author);
      fd.append("text", text);
      fd.append("image", file);
      await fetch("/api/chat", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      }).then(async (r) => {
        if (r.status === 401) {
          window.location.href = "/login";
          throw new Error("Unauthorized");
        }
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      });
    } else {
      await api("/api/chat", {
        method: "POST",
        json: true,
        body: JSON.stringify({ author, text }),
      });
    }
    $("text").value = "";
    $("image").value = "";
    await refreshChat();
    await refreshArchive();
  } catch (err) {
    alert(`Chat error: ${err.message}`);
  }
});

$("done-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const taskName = $("done-task").value.trim();
  if (!taskName) return;
  if (!confirm(`Delete all captures for « ${taskName} » ?`)) return;
  try {
    await api("/api/mark-task-done", {
      method: "POST",
      json: true,
      body: JSON.stringify({ taskName }),
    });
    $("done-task").value = "";
    await refreshCaptures();
    await refreshArchive();
  } catch (err) {
    alert(`Done error: ${err.message}`);
  }
});

$("refresh-archive").addEventListener("click", () => refreshArchive());

$("dl-global").addEventListener("click", (e) => {
  e.preventDefault();
  fetch("/api/archive.txt", { credentials: "same-origin" })
    .then(async (r) => {
      if (r.status === 401) {
        window.location.href = "/login";
        throw new Error("Unauthorized");
      }
      if (!r.ok) throw new Error(String(r.status));
      return r.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "capture-chat-archive.txt";
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch((err) => alert(`Download failed: ${err.message}`));
});

async function refreshChat() {
  const data = await api("/api/chat");
  const box = $("messages");
  box.innerHTML = "";
  for (const m of data.messages) {
    const el = document.createElement("article");
    el.className = "msg";
    el.innerHTML = `<div class="meta">${m.ts} · ${escapeHtml(m.author)}</div><div class="body"></div>`;
    el.querySelector(".body").textContent = m.text || "";
    if (m.imageUrl) {
      const img = document.createElement("img");
      img.alt = "chat image";
      fetch(m.imageUrl, { credentials: "same-origin" })
        .then((r) => r.blob())
        .then((b) => {
          img.src = URL.createObjectURL(b);
        });
      el.appendChild(img);
    }
    box.appendChild(el);
  }
  box.scrollTop = box.scrollHeight;
}

async function refreshCaptures() {
  const data = await api("/api/captures");
  const box = $("tasks");
  box.innerHTML = "";
  if (!data.tasks.length) {
    box.textContent = "Aucune capture.";
    return;
  }
  for (const t of data.tasks) {
    const el = document.createElement("div");
    el.className = "task";
    const h = document.createElement("h2");
    h.textContent = t.taskName;
    el.appendChild(h);
    const ul = document.createElement("ul");
    for (const c of t.captures) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#";
      a.textContent = `${c.name} (${c.size} B)`;
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        fetch(c.url, { credentials: "same-origin" })
          .then((r) => r.blob())
          .then((b) => {
            const url = URL.createObjectURL(b);
            window.open(url, "_blank");
          });
      });
      li.appendChild(a);
      ul.appendChild(li);
    }
    el.appendChild(ul);
    box.appendChild(el);
  }
}

async function refreshArchive() {
  const data = await api("/api/archive");
  const list = $("archive-files");
  list.innerHTML = "";
  for (const f of data.files) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${f.name} (${f.size} B)`;
    btn.addEventListener("click", async () => {
      const text = await api(`/api/archive/${encodeURIComponent(f.name)}`);
      $("archive-view").textContent = text || "(empty)";
    });
    li.appendChild(btn);
    list.appendChild(li);
  }
  const global = await api("/api/archive.txt");
  $("archive-view").textContent = global || "(empty)";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function refreshAll() {
  try {
    await Promise.all([refreshChat(), refreshCaptures(), refreshArchive()]);
  } catch (err) {
    $("messages").innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

ensureSession().then(refreshAll);
setInterval(() => {
  refreshAll().catch(() => {});
}, 8000);
