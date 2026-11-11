# Atlas Unix / macOS prerequisite installer

One-shot setup for **Linux**, **macOS**, and **WSL**: Node ≥ 20, pnpm 9.15.0, data plane (Docker Compose **or** native Postgres 16 + Redis 7), `.env`, `pnpm install`, shared package builds, checklist, optional `pnpm dev`.

Does **not** start any Cursor / agent worker.

```bash
# From repo root
bash scripts/unix/install-atlas-prereqs.sh
bash scripts/unix/install-atlas-prereqs.sh --skip-launch
bash scripts/unix/install-atlas-prereqs.sh --skip-install   # checklist only
bash scripts/unix/install-atlas-prereqs.sh --self-test      # Darwin keg PATH stubs (Linux CI OK)
bash scripts/unix/run-atlas-shell.sh --self-test            # Scan shell PATH stubs (Linux CI OK)
```

**macOS / Homebrew:** `node@20` is keg-only. The installer prepends `$(brew --prefix node@20)/bin` to `PATH` and re-checks `node -v` (fail-closed) — same idea as Windows `Refresh-PathFromMachine` after winget. `pnpm atlas:shell` / AtlasLocal also prepend at runtime so `/start-api` children still see Node. `run-atlas-shell.sh --self-test` proves GUI brew-off-PATH + keg-direct fallbacks without a Mac.

## After install

| Surface | URL |
|---------|-----|
| API | http://127.0.0.1:3001/v1/health |
| Client Scanner (Vite) | http://127.0.0.1:3002/ |
| Desktop Scan shell | http://127.0.0.1:17865/ (`pnpm atlas:shell` or `remote-work/atlas-v1` binary) |

Login seed: `owner@demo.atlas.local` / `atlas-demo`.

Local real-mission liability path needs `ATLAS_AUTHZ=signed` in `.env` when no Pragma Sign envelope is attached (the installer appends it if missing).

## Windows twin

[`scripts/windows/Install-AtlasPrereqs.ps1`](../windows/Install-AtlasPrereqs.ps1) — same checklist idea on a real Windows host (Docker Desktop).
