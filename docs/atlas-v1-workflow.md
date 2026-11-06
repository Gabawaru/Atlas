# Atlas v1 — end-to-end workflow

User download → Setup → **Scan** → Paradise attach → Circuit A → Policy Guard →
`web.passive.presence.v1` + shortlist suite → report export.

## Download

Homepage CTA → `https://cultivationparadise.com/api/atlas/download` (`Atlas-Setup.exe`).

## Install & Scan

1. Run Setup → `Atlas.exe`
2. Start API (`AtlasLocal start` or `pnpm dev:api`) on `:3001`
3. Atlas.exe opens `http://127.0.0.1:17865/` — **Scan** button
4. Paste Paradise attestation + RoE host → Scan (waits Circuit A, then execute)
5. Download JSON/CSV/PDF from the Scan UI (or client `:3002`)

## Ship rebuild

```bash
cd remote-work/atlas-v1 && ./build.sh
# → offline-installer/bin/Atlas-Setup.exe (Release / Paradise asset)
```

Sources: `remote-work/atlas-v1/` (Go shell + embedded platform HTML + NSIS).  
Shortlist modules: `docs/shortlist-modules.md`.  
RoE: `*.pragma-cloud.com`, `*.pragma-serve.com`, `*.pragma.mc` only.

## Out of v1 acceptance

| Dropped | Why |
|---------|-----|
| **Tauri stub** (`apps/client/src-tauri`) | Not the Paradise download PE; webkit/signing absent; NSIS Scan shell is the desktop ship. Do not block v1 Done on `tauri build`. |
| Docker images inside Setup | Host runs AtlasLocal once; images stay on machine. |
