# Atlas Capture Chat (MVP)

Small online **capture storage + chat** for Gabriel. Windows exe sends screenshots/files tied to a **task name**; the web UI shows chat, captures, and a plain-text **archive** for full traceability. When a task is marked **done**, its captures are deleted (recycled).

**iOS client: deferred** (follow-up). Windows only for this MVP.

## Layout

```
remote-work/capture-chat/
  server/           Express API (disk storage + archive logs)
  public/           Simple web UI (chat, captures, archive)
  client-windows/   Go source → capture-chat.exe
  bin/capture-chat.exe  Prebuilt Windows binary (also rebuildable)
  data/             Runtime data (gitignored): captures/, chat/, archive/
  .env.example      CAPTURE_CHAT_TOKEN, PORT
```

## Auth

Shared bearer token via env `CAPTURE_CHAT_TOKEN` (never commit real values).  
Send `Authorization: Bearer <token>` (or `X-Capture-Token`).

## API (MVP)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/captures` | multipart `file` + `taskName` → store as `{task}__{stamp}__{name}` |
| GET | `/api/captures` | list tasks + files |
| POST | `/api/mark-task-done` | JSON `{ "taskName" }` → delete all captures for task |
| GET/POST | `/api/chat` | list / post message (`author`, `text`; optional multipart `image`) |
| GET | `/api/archive` | list archive log files |
| GET | `/api/archive.txt` or `/archive.txt` | download global concatenated archive |
| GET | `/api/archive/:name` | view/download one log (`?download=1`) |

## Archive (textual traceability)

Append-only plain text under `data/archive/`:

- `YYYY-MM-DD.log` — global daily log
- `task-<taskName>.txt` — per-task log

Events logged (timestamped, **no secrets**): `TASK_CREATE`, `CAPTURE`, `CHAT`, `TASK_DONE`, `TASK_DELETE`.

**In the UI:** open the page → section **Archive** → browse files or **Télécharger archive.txt**.  
**CLI:** `curl -H "Authorization: Bearer $TOKEN" http://HOST:8787/api/archive.txt -o archive.txt`

## Run the server

```bash
cd remote-work/capture-chat
cp .env.example .env   # set CAPTURE_CHAT_TOKEN
npm install
# load env then start (or export vars yourself)
export $(grep -v '^#' .env | xargs)
npm start
# → http://127.0.0.1:8787
```

Smoke test (spawns a temp server):

```bash
npm run smoke
```

## Windows executable

**Name:** `capture-chat.exe`  
**In-repo path:** `remote-work/capture-chat/bin/capture-chat.exe`

### Build

```bash
cd remote-work/capture-chat
bash scripts/build-windows-exe.sh
# → client-windows/capture-chat.exe (copied to bin/ in CI/dev as needed)
```

### Configure server URL

1. Copy `client-windows/capture-chat.env.example` to `capture-chat.env` **next to the exe**.
2. Set:
   - `CAPTURE_CHAT_URL=http://<server-host>:8787`
   - `CAPTURE_CHAT_TOKEN=<same as server>`
3. Or pass flags / env: `-url`, `-token`, `-task`, `-file`.

### Run

```text
capture-chat.exe
capture-chat.exe -task my-task
capture-chat.exe -task my-task -file C:\Users\Gab\Desktop\shot.png
```

Without `-file`, the exe takes a full-screen screenshot via PowerShell, prompts for a task name if needed, and POSTs to the server.

## Chat flow (example)

1. Gab pastes terminal text in the web UI (author `gab`).
2. Coordinator/agent replies e.g. `OK, j'ai vérifié`.
3. Optional: attach an image on the message for screenshot analysis.
4. Everything is also appended to the archive logs.

## Follow-up

- **iOS** capture client — not in this MVP.
- Hosting/TLS and stronger auth later if needed.
