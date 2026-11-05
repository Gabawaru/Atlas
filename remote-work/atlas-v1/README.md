# Atlas v1 — Windows platform (Scan)

Ship path for Paradise `GET /api/atlas/download` → `Atlas-Setup.exe`.

## What the exe contains

| Path after install | Role |
|--------------------|------|
| `Atlas.exe` | Opens local platform UI (`http://127.0.0.1:17865/`) with a **Scan** button |
| `README.txt` | RoE + how to start API |
| `tools/Install-AtlasPrereqs.*` | Optional host prereqs for the private monorepo |

**Scan** (real path only in this shell): login → connector → asset → mission `synthetic:false` → Paradise attach → wait Circuit A → Policy Guard → BullMQ `web.passive.presence.v1` + cooperating shortlist suite → report export JSON/CSV/PDF.

No secrets in the PE. API must be running (`AtlasLocal.exe start` or `pnpm dev:api`).

## Rebuild

```bash
cd remote-work/atlas-v1
./build.sh
# → payload/Atlas.exe, dist/Atlas-Setup.exe
# → copies Setup to ../offline-installer/bin/Atlas-Setup.exe (Release asset)
```

Requires: Go ≥ 1.22, `makensis` (NSIS).
