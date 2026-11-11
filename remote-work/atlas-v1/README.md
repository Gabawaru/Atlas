# Atlas Scan shell — multi-OS platform

Ship path for public `https://atlas-secu.com/Atlas-Setup.exe` (Windows) **and**
native Linux / macOS binaries (`bin/atlas`, `bin/atlas-linux-*`, `bin/atlas-darwin-*`).

**v1 acceptance (Windows download):** NSIS `Atlas-Setup.exe` + Scan shell.  
**Tauri stub (`apps/client/src-tauri`) is out of v1 acceptance** — not a ship blocker.

Paradise attestation was removed (aligned with monorepo PR #58). Scan uses
`POST /v1/missions/:id/owner-authorization` (liability checkbox) + Circuit A + Policy Guard.
Local signed path: `ATLAS_AUTHZ=signed` **only when** no Sign envelope is attached.

## What the shell provides

| Artifact | Role |
|----------|------|
| `Atlas.exe` / `bin/atlas` | Local platform UI (`http://127.0.0.1:17865/`) — **Scan** + **Démarrer l’API** |
| `AtlasLocal.exe` / `AtlasLocal` | Bundled stack launcher (`start` / `install`) — Docker **or** native PG/Redis |
| `README.txt` (Windows payload) | RoE + start path |
| `tools/Install-AtlasPrereqs.*` | Optional host prereqs for the private monorepo |

**Scan** (real path): **Démarrer l’API** → login → connector → asset → mission `synthetic:false` → owner-authorization → Circuit A → Policy Guard → BullMQ `web.passive.presence.v1` → export JSON/CSV/PDF.

Alternative without the shell: Vite client on `:3002` (`pnpm dev:client`) — same Scanner product path on Linux/macOS/Windows.

## Health check

Same on Windows `Atlas.exe` and Unix `atlas`:

```bash
curl -s http://127.0.0.1:17865/healthz
# → {"ok":true,"service":"atlas-shell","os":"windows"|"linux"|…,"arch":"amd64",…}
```

If Gab’s installed PE still returns **404**, the Dev payload was stale — rebuild and replace `payload/Atlas.exe` (source route is shared; not Windows-specific).

**Démarrer l’API** resolves `AtlasLocal` beside the shell, then Windows `%LOCALAPPDATA%\AtlasLocal`, then Unix/macOS `ATLAS_HOME` / `~/Atlas` (+ payload/bin layouts), app-support `install-path.txt`, and `PATH`.

## Rebuild

```bash
cd remote-work/atlas-v1
./build.sh
# → payload/Atlas.exe (+ AtlasLocal*), bin/atlas (+ cross targets), dist/Atlas-Setup.exe (if makensis)
```

From repo root:

```bash
pnpm atlas:build-shell
pnpm atlas:shell          # run native shell on :17865
```

Requires: Go ≥ 1.22. `makensis` only for the Windows Setup PE.
