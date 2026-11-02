const $ = (id) => document.getElementById(id);

const state = {
  token: localStorage.getItem("captureChatToken") || "",
};

if (state.token) $("token").value = state.token;

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${state.token}`, ...extra };
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { ...(opts.headers || {}), ...authHeaders(opts.json ? { "Content-Type": "application/json" } : {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${body}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

$("auth-form").addEventListener("submit", (e) => {
  e.preventDefault();
  state.token = $("token").value.trim();
  localStorage.setItem("captureChatToken", state.token);
  refreshAll();
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
      await fetch("/api/chat", { method: "POST", headers: authHeaders(), body: fd }).then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      });
    } else {
      await api("/api/chat", {
        method: "POST",
        json: true,
        headers: {},
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
  if (!state.token) {
    alert("Connecte d’abord avec le token.");
    return;
  }
  // Fetch with auth then trigger download (anchor alone cannot send Bearer).
  fetch("/api/archive.txt", { headers: authHeaders() })
    .then(async (r) => {
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
      // authenticated image: blob fetch
      fetch(m.imageUrl, { headers: authHeaders() })
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
        fetch(c.url, { headers: authHeaders() })
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
  // default view: global concat
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
  if (!state.token) return;
  try {
    await Promise.all([refreshChat(), refreshCaptures(), refreshArchive()]);
  } catch (err) {
    $("messages").innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

if (state.token) refreshAll();
setInterval(() => {
  if (state.token) refreshAll().catch(() => {});
}, 8000);
