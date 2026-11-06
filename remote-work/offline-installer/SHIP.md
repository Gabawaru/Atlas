# Atlas Setup — ship identity

Public CTA (`atlas-secu.com`) → `Gabawaru/Atlas` `releases/latest` → asset `Atlas-Setup.exe`.

| Field | Value |
|-------|--------|
| Asset name | `Atlas-Setup.exe` |
| Size (bytes) | `2089922` |
| SHA256 | `51696c9755e3cf062a881e64a4af49f6b9aa1d641e0a4e1758e81c7f939681e2` |
| GitHub Releases | `v1.3.0` (latest) · prior `v1.2.0` |
| Build | `cd remote-work/atlas-v1 && ./build.sh` → `../offline-installer/bin/Atlas-Setup.exe` |
| Product version (NSIS) | `1.3.0` |

## Prior ship (v1.2.0)

| Size | SHA256 |
|------|--------|
| 2089266 | `b4e09dda7444861e3b086b0c704cf8657fea058b64f36cea5b533fd0d3ae19ab` |

## Optional Paradise stream refresh

If Cultivation Paradise still bundles a stale PE under `server-assets`, refresh from this repo:

```bash
./remote-work/offline-installer/scripts/refresh-paradise-server-asset.sh /path/to/Cultivation-Paradise
```

Or point Vercel `ATLAS_V1_DOWNLOAD_URL` at:

`https://github.com/Gabawaru/Atlas/releases/download/v1.3.0/Atlas-Setup.exe`

## atlas-secu.com CTA

Live Pages should keep linking `https://github.com/Gabawaru/Atlas/releases/latest` (anon download of `Atlas-Setup.exe` via `/latest/download/Atlas-Setup.exe`).
