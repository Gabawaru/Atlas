# Atlas — offline installer (Windows PE + native Linux/macOS launcher)

Pack so the Gab workflow runs **without Cursor** and without `agent worker start`.
Windows keeps NSIS / `AtlasLocal.exe`; Linux/macOS use the native `AtlasLocal` binary
(same commands). Data plane: Docker Compose **or** native Postgres/Redis on localhost.

Updates: Gab pushes to `Gabawaru/Atlas` (phone OK) → installed launcher **`git pull`s** and restarts the local stack.

## Artifacts (after `./build.sh`)

| File | Role |
|------|------|
| `bin/Atlas-Setup.exe` | **Ship download name** — GitHub Release asset for `/api/atlas/download` |
| `bin/AtlasLocal-Setup.exe` | NSIS installer (Start Menu shortcuts) |
| `bin/AtlasLocal-portable.zip` | Same bits, no installer |
| `bin/AtlasLocal.exe` | CLI launcher (Windows) |
| `bin/AtlasLocal` / `AtlasLocal-*` | CLI launcher (native + cross Linux/macOS) |

(Uses `bin/` not `dist/` — root `.gitignore` ignores all `dist/`.)

**Release chain:** tag `v*` (or `Release Atlas-Setup` workflow_dispatch) uploads `bin/Atlas-Setup.exe` only. Downstream download hosts set `ATLAS_V1_DOWNLOAD_URL` to that Release asset (private repo → authenticated fetch).

**Version lock:** GitHub Release tag `vX.Y.Z`, NSIS `PRODUCT_VERSION` (`remote-work/atlas-v1/installer/Atlas.nsi`), and `atlas-secu-pages` `/Atlas-Setup.exe` must be the **same** bytes + version. After a Setup rebuild, publish the tag **and** copy the PE to Pages in the same cut — do not leave site 1.3.x ahead/behind `releases/latest`.

**Silent install:** `Atlas-Setup.exe /S` must exit after files land (NSIS `IfSilent` skips the uninstall-icon `MessageBox`; `SetAutoClose` + `MUI_FINISHPAGE_RUN_NOTCHECKED`). CI pin: `apps/client/src/windowsNsisSilentPin.test.ts` + release workflow version lock (`PRODUCT_VERSION` == tag `vX.Y.Z`, PE ≥ 2 MiB).

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
- Auto-update loop: **Watch updates** / `AtlasLocal.exe watch` (or `watch 60`)
  - Each tick: `git fetch` → compare `HEAD` vs `origin/<branch>` → **pull only if ahead** → `pnpm install` → **restart api + client**
  - Interval: `ATLAS_WATCH_SECONDS` (default `300`, min `30`) or positional `watch [seconds]`
- Optional Task Scheduler: `scripts\Register-AtlasWatchTask.ps1` (runs `watch`)

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

| Var | Default | Notes |
|-----|---------|-------|
| `ATLAS_HOME` | `%USERPROFILE%\Atlas` | Clone + `.env` root |
| `ATLAS_REPO_URL` | `https://github.com/Gabawaru/Atlas.git` | Used by `install` |
| `ATLAS_BRANCH` | `main` | Branch `watch`/`update` track |
| `ATLAS_WATCH_SECONDS` | `300` | Poll interval (min 30); override with `watch 60` |
| `ATLAS_SERVICES` | `api,client` | Managed processes. Set to `-` or `none` to skip |

## Commands

| Command | What it does |
|---------|----------------|
| `install` | Clone (or update if present), seed `.env` from example |
| `update` | `git fetch` + `pull --ff-only` (preserves `.env`) |
| `start` | `docker compose up -d` + `pnpm install` + start api/client |
| `stop` | Stop managed api/client + `docker compose stop` |
| `status` | Tools, HEAD, `origin/<branch>`, service PIDs |
| `watch [seconds]` | Auto-update loop (fetch → compare → pull → rebuild → restart) |

Managed service logs/PIDs live under `%ATLAS_HOME%\.atlaslocal\` (`api.pid` / `api.log`, etc.).
