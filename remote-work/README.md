# remote-work

Windows / personal-PC continuation for Atlas.

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

| Path | Role |
|------|------|
| [`offline-installer/`](offline-installer/) | Zero-Cursor Windows installer + `AtlasLocal.exe` (git pull updates) |

Related open PRs (not necessarily on `main` yet):

- Pack + stub `bin/Atlas.exe` — [#38](https://github.com/Gabawaru/Atlas/pull/38)
- Capture-chat + `capture-chat.exe` — [#39](https://github.com/Gabawaru/Atlas/pull/39)
