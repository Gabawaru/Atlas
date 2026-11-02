# Atlas — offline installer (Windows, zero Cursor)

Pack for Gabriel’s Windows PC so the Gab workflow runs **without Cursor** and without `agent worker start`.

Updates: Gab pushes to `Gabawaru/Atlas` (phone OK) → installed launcher **`git pull`s** and restarts the local stack.

## Artifacts (after `./build.sh`)

| File | Role |
|------|------|
| `bin/AtlasLocal-Setup.exe` | NSIS installer (Start Menu shortcuts) |
| `bin/AtlasLocal-portable.zip` | Same bits, no installer |
| `bin/AtlasLocal.exe` | CLI launcher alone |

(Uses `bin/` not `dist/` — root `.gitignore` ignores all `dist/`.)

## On the Windows PC

### One-time

1. Install prereqs (not bundled — Docker images alone are multi‑GB):
   - [Git for Windows](https://git-scm.com/download/win)
   - [Node.js ≥ 20](https://nodejs.org/) → then `corepack enable && corepack prepare pnpm@9.15.0 --activate`
   - [Docker Desktop](https://www.docker.com/products/docker-desktop/)
2. Run `AtlasLocal-Setup.exe` **or** unzip portable and keep `AtlasLocal.exe` + `scripts/`.
3. Double‑click **Install Atlas** (or `AtlasLocal.exe install`) → clones to `%USERPROFILE%\Atlas`.
4. Paste secrets **only** into `%USERPROFILE%\Atlas\.env` (`PRAGMA_SIGN_API_KEY`, `RESEND_API_KEY`).
5. **Start Atlas** → `docker compose up -d` + `pnpm install`, then run `pnpm demo:smoke` / `pnpm dev:*` as printed.

### Updates (phone → git push → PC)

- Manual: **Update Atlas** shortcut / `AtlasLocal.exe update`
- Loop: **Watch updates** / `AtlasLocal.exe watch` (default every 300s; override `ATLAS_WATCH_SECONDS`)
- Optional Task Scheduler: `scripts\Register-AtlasWatchTask.ps1`

### Stop

**Stop Atlas** / `AtlasLocal.exe stop` → `docker compose stop`.

## What this replaces

| Old (Cursor) | New |
|--------------|-----|
| `agent login` + `agent worker start` | Not required |
| Cloud agent writing `.env` / running smoke on Gab PC | Gab (or this launcher) runs locally |
| Manual zip of repo | `install` + `update` via git |

## What this does **not** replace

- Node / pnpm / Docker / Git (host tools)
- Atlas product runtime itself (`apps/api` BullMQ worker is **in-process** with the API — still needs Postgres+Redis)
- Message-only stub `remote-work/bin/Atlas.exe` (PR #38) — different binary; welcome stub, not the stack
- Air-gap offline (network still needed for `git pull` and optional Sign/Resend APIs)

## Build (Linux CI / cloud agent)

```bash
cd remote-work/offline-installer
./build.sh
# → bin/AtlasLocal.exe, AtlasLocal-Setup.exe, AtlasLocal-portable.zip
```

Requires: Go ≥ 1.22, `makensis` (NSIS), `zip`.

## Env overrides

| Var | Default |
|-----|---------|
| `ATLAS_HOME` | `%USERPROFILE%\Atlas` |
| `ATLAS_REPO_URL` | `https://github.com/Gabawaru/Atlas.git` |
| `ATLAS_BRANCH` | `main` |
| `ATLAS_WATCH_SECONDS` | `300` |
