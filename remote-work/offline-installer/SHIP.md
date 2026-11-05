# Atlas Setup — ship identity (Paradise download chain)

**Do not invent a second download URL.** Paradise `GET /api/atlas/download` must stream this PE.

| Field | Value |
|-------|--------|
| Asset name | `Atlas-Setup.exe` |
| Size (bytes) | `2089611` |
| SHA256 | `f3178e782b2096c03d930421d523a812e5c2043311a4cddcc36eaf597c82dd26` |
| GitHub Releases | `v1.0.0` (clobber) · `v1.2.0` |
| Build | `cd remote-work/atlas-v1 && ./build.sh` → `bin/Atlas-Setup.exe` |

## Live drift (2026-11-05)

| Surface | Size | SHA256 | Source header |
|---------|------|--------|---------------|
| GitHub Release `v1.0.0` / `v1.2.0` | 2089611 | `f3178e78…` | — |
| Paradise `/api/atlas/download` | **688793** (stale) | `a5c0476f…` | `x-atlas-source: **paradise-gate**` |

`paradise-gate` = Paradise is **not** re-streaming GitHub Release (bundled `server-assets` fallback and/or missing token). Updating Atlas Release alone does not change live bytes until Paradise refreshes.

## Paradise refresh (closes live `paradise-gate` 688793 drift)

Live `x-atlas-source: paradise-gate` means Paradise is serving **bundled** `src/server-assets/atlas-v1/Atlas-Setup.exe`, not GitHub Release. Atlas Releases are already current — pick **A and/or B**:

### A — Replace bundled PE (works without Vercel token)

From this repo (after clone of Cultivation-Paradise):

```bash
./remote-work/offline-installer/scripts/refresh-paradise-server-asset.sh /path/to/Cultivation-Paradise
# then in Paradise: commit server-assets + deploy
```

### B — Stream Release (Vercel — no secrets in git)

1. Confirm Release: `gh release download v1.2.0 -p Atlas-Setup.exe`
2. Vercel **cultivation-paradise** → Production:
   - `ATLAS_V1_DOWNLOAD_URL` = `https://github.com/Gabawaru/Atlas/releases/download/v1.2.0/Atlas-Setup.exe`
   - `ATLAS_GITHUB_TOKEN` = Contents:Read PAT on **Gabawaru/Atlas** (dashboard only)
3. **Redeploy** Production.
4. Smoke body size **2089611**; prefer `x-atlas-source: github-release`.

## atlas-secu.com CTA

Monorepo `index.html` already points at Paradise stream. Live Pages may still link private Releases — copy monorepo `index.html` to `Gabawaru/atlas-secu-pages` (agent push **403**).

```bash
./scripts/check-pages-cta.sh   # fails while live CTA ≠ Paradise
```

CI job **atlas-secu.com CTA** in `Verify download chain` does the same.
