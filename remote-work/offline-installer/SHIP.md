# Atlas Setup — ship identity (Paradise download chain)

**Do not invent a second download URL.** Paradise `GET /api/atlas/download` must stream this PE.

| Field | Value |
|-------|--------|
| Asset name | `Atlas-Setup.exe` |
| Size (bytes) | `2088299` |
| SHA256 | `36102410eedf62ccd4d086b688550966d2483292a46f8388b8b22876c231e6a8` |
| GitHub Releases | `v1.0.0` (clobber) · `v1.2.0` |
| Build | `cd remote-work/atlas-v1 && ./build.sh` → `bin/Atlas-Setup.exe` |

## Live drift (2026-11-05)

| Surface | Size | SHA256 | Source header |
|---------|------|--------|---------------|
| GitHub Release `v1.0.0` | 2088299 | `36102410…` | — |
| Paradise `/api/atlas/download` | **688793** (stale) | `a5c0476f…` | `x-atlas-source: **paradise-gate**` |

`paradise-gate` = Paradise is **not** re-streaming GitHub Release (bundled `server-assets` fallback and/or missing token). Updating Atlas Release alone does not change live bytes until Paradise refreshes.

## Paradise refresh (Gab / Vercel — no secrets in git)

1. Confirm Release asset matches table above (`gh release download v1.2.0 -p Atlas-Setup.exe`).
2. Vercel project **cultivation-paradise** → set (values only in dashboard):
   - `ATLAS_V1_DOWNLOAD_URL` = `https://github.com/Gabawaru/Atlas/releases/download/v1.2.0/Atlas-Setup.exe`  
     (or `…/releases/latest/download/Atlas-Setup.exe`)
   - `ATLAS_GITHUB_TOKEN` = Contents:Read PAT on **Gabawaru/Atlas** (never commit)
3. **Redeploy** Production.
4. Smoke: `curl -sI https://cultivationparadise.com/api/atlas/download` → attachment; body size **2088299**; prefer `x-atlas-source: github-release` (not `paradise-gate`).
5. Optional: replace bundled `src/server-assets/atlas-v1/Atlas-Setup.exe` in Paradise with this PE so fallback matches.

## atlas-secu.com CTA

Monorepo `index.html` already points at Paradise stream. Live Pages may still link private Releases — copy monorepo `index.html` to `Gabawaru/atlas-secu-pages`.
