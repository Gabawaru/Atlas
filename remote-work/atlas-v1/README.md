# Atlas v1 — Windows platform (Scan)

Ship path for public `https://atlas-secu.com/Atlas-Setup.exe`.

**v1 acceptance:** NSIS `Atlas-Setup.exe` + Scan shell only.  
**Tauri stub (`apps/client/src-tauri`) is out of v1 acceptance** — not a ship blocker.

Paradise attestation was removed (aligned with monorepo PR #58). Scan uses
`POST /v1/missions/:id/owner-authorization` (stub) + Circuit A + Policy Guard.
Local signed path: `ATLAS_AUTHZ=signed` **only when** `PRAGMA_SIGN_API_KEY` is unset
(otherwise Sign poll shadows the local flag).

## What the exe contains

| Path after install | Role |
|--------------------|------|
| `Atlas.exe` | Local platform UI (`http://127.0.0.1:17865/`) — **Scan** + **Démarrer l’API** |
| `AtlasLocal.exe` | Bundled stack launcher (`start` / `install`) — no Docker images in the PE |
| `README.txt` | RoE + start path |
| `tools/Install-AtlasPrereqs.*` | Optional host prereqs for the private monorepo |

**Scan** (real path): **Démarrer l’API** → login → connector → asset → mission `synthetic:false` → owner-authorization → Circuit A (or **Reprendre**) → Policy Guard → BullMQ `web.passive.presence.v1` + cooperating shortlist suite → export JSON/CSV/PDF.

No secrets in the PE. First host: Start Menu → *Installer le stack* once (+ `.env` in `%USERPROFILE%\Atlas`), then **Démarrer l’API** from Scan.

## Rebuild

```bash
cd remote-work/atlas-v1
./build.sh
# → payload/Atlas.exe (+ copies AtlasLocal.exe), dist/Atlas-Setup.exe
# → copies Setup to ../offline-installer/bin/Atlas-Setup.exe (Release asset)
```

Requires: Go ≥ 1.22, `makensis` (NSIS), existing `../offline-installer/bin/AtlasLocal.exe`.
