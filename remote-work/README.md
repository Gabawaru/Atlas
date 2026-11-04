# remote-work

Windows / personal-PC continuation for Atlas.

**Repo:** https://github.com/Gabawaru/Atlas  
**Site:** https://atlas-secu.com  
**Releases:** https://github.com/Gabawaru/Atlas/releases/latest

## Fresh Windows setup

1. Install [Git for Windows](https://git-scm.com/download/win) (Download for Windows, default options).
2. Open **cmd** and clone:

   ```bat
   git clone https://github.com/Gabawaru/Atlas.git
   ```

3. Enter the repo:

   ```bat
   cd Atlas
   ```

4. Run the one-shot prereq installer (Node 20, pnpm 9.15, Docker Postgres 16 + Redis 7). It prints a pass/fail checklist, then launches the Atlas UI (`pnpm dev`). Does **not** start Cursor/agent workers:

   ```bat
   scripts\windows\Install-AtlasPrereqs.cmd
   ```

   Details: [`scripts/windows/README.md`](../scripts/windows/README.md).

5. Optional offline stack launcher — `AtlasLocal-Setup.exe` is on `main` under [`offline-installer/bin/`](offline-installer/bin/) (see [`offline-installer/README.md`](offline-installer/README.md)):

   ```bat
   AtlasLocal.exe install
   AtlasLocal.exe update
   AtlasLocal.exe start
   AtlasLocal.exe stop
   AtlasLocal.exe watch
   ```

   Or use Start Menu shortcuts after running the Setup exe. Paste secrets only into local `.env`.

## Pack contents

| Path | Role |
|------|------|
| `README.md` | This guide |
| `.env.example` | Variable template (empty placeholders for secrets) |
| `docs/atlas-gab-tuto-etapes.md` | Gab steps (keys / worker / CF / notify) |
| `docs/atlas-cf-routing-ben-checklist.md` | CF Email Routing checklist (Ben zone) |
| `docs/atlas-product-loop.md` | Product loop Mail + keys (no secrets) |
| `docs/resend-full-access-gab-roadmap.md` | Resend full_access roadmap |
| `docs/atlas-secu-handoff.md` | Founders handoff (Pages, mail, Sign, RoE) |
| `docs/atlas-roe-perimeter.md` | Scope / Rules of Engagement |
| `bin/Atlas.exe` | Desktop stub Windows (message-only) |
| `bin/BUILD.md` | How the binary was built |
| [`offline-installer/`](offline-installer/) | Zero-Cursor Windows installer + `AtlasLocal.exe` |

## Download the stub executable

- **In repo:** [`bin/Atlas.exe`](bin/Atlas.exe)
- **Release URL:** https://github.com/Gabawaru/Atlas/releases/latest/download/Atlas.exe  
  (tag `v0.1.0-windows-stub`; private repo → needs GitHub login)

Double-click → welcome message + links. **No scan** runs in this process. Stub ≠ signed Tauri product; supported UI = Vite web client.

## Hard rules

- **Zero secrets in git.** `.env` is gitignored — copy `.env.example` → `.env` at the Atlas repo root and paste keys locally only.
- RoE: only the documented perimeter (`docs/atlas-roe-perimeter.md`) — out of scope = ask Ben/Romain.
- `Atlas.exe` stub ≠ stack launcher; use `offline-installer/` / `scripts/windows/` for the real local stack.

## Related

- Capture-chat + `capture-chat.exe` — [#39](https://github.com/Gabawaru/Atlas/pull/39)
