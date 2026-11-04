# Atlas Windows prerequisite installer

One-shot setup for a **real Windows** machine: Node 20, pnpm 9.15.0, Docker Desktop + `docker compose` (Postgres 16 + Redis 7), then checklist + Atlas UI (`pnpm dev`).

Does **not** start any Cursor / agent worker.

## One-liner

From the repo root (PowerShell):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Install-AtlasPrereqs.ps1
```

Or double-click / cmd:

```bat
scripts\windows\Install-AtlasPrereqs.cmd
```

Checklist only (no install / no UI):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Install-AtlasPrereqs.ps1 -SkipInstall -SkipLaunch
```

Install + checklist, skip UI launch:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Install-AtlasPrereqs.ps1 -SkipLaunch
```

## What it does

1. Installs Node.js 20 via `winget` (`OpenJS.NodeJS.20`) if needed  
2. Activates **pnpm 9.15.0** via Corepack (`npm -g` fallback)  
3. Installs Docker Desktop via `winget` if `docker` is missing  
4. Runs `docker compose up -d` (repo `docker-compose.yml`: Postgres 16 + Redis 7)  
5. Copies `.env.example` → `.env` when missing; runs `pnpm install`  
6. Prints a **pass/fail** checklist for each prereq  
7. On full success: starts **`pnpm dev`** (API + admin + client)

## Windows blockers

- Docker Desktop must run on a **real Windows host** (WSL2 backend). This Linux CI/cloud agent cannot replace that step.
- First Docker Desktop install often needs a reboot / manual “Start Docker Desktop” before `docker info` works — re-run the script after the daemon is healthy.
- `winget` + admin rights are required for silent Node/Docker installs.

## Artifact

Zip of this folder (built in CI/agent when feasible): `scripts/windows/atlas-windows-prereqs.zip` containing the `.ps1`, `.cmd`, and this README.
