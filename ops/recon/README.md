# Atlas recon toolkit (authorized use only)

Defensive reconnaissance **prep** for Atlas operators. This tree holds directory layout, install notes, and **placeholder** command templates.

## Hard rules

1. **Authorized use only** — lab assets or a signed Rules of Engagement (RoE) / written authorization from the asset owner **and** company A approval (Atlas Policy Guard). Subscription ≠ authorization.
2. **No scans from CI or agents** against real or external hosts. Local `--version` / `--help` checks only unless `ATLAS_AUTHZ=signed` and a human operator intentionally runs a template.
3. **No exploit payloads, attack PoCs, or offensive exploit code** in this toolkit. Nuclei/ffuf templates here are high-level discovery patterns only.
4. **Never commit** real customer hostnames, credentials, RoE PDFs with secrets, or raw engagement output under `targets/` (use `_example-lab` as the committed skeleton only).

## Layout

```
ops/recon/
  README.md                 # this file
  INSTALL.md                # what installed vs deferred on this VM
  bin/atlas-recon           # safety wrapper (refuses unless ATLAS_AUTHZ=signed)
  templates/                # shell command templates (PLACEHOLDER targets)
  targets/<target-slug>/
    raw/                    # tool stdout (local / not committed)
    reports/                # derived summaries (local / not committed)
    notes/                  # operator notes for that engagement
```

Create a per-engagement folder:

```bash
TARGET_SLUG=example-lab   # replace with authorized slug only
mkdir -p ops/recon/targets/${TARGET_SLUG}/{raw,reports,notes}
```

## Using templates (after RoE)

```bash
export ATLAS_AUTHZ=signed
export TARGET_DOMAIN=lab.example.invalid   # PLACEHOLDER — never a real customer host in docs/CI
export OUT_DIR=ops/recon/targets/example-lab/raw

./ops/recon/bin/atlas-recon dns
./ops/recon/bin/atlas-recon ports
./ops/recon/bin/atlas-recon subdomains
./ops/recon/bin/atlas-recon nuclei
./ops/recon/bin/atlas-recon fuzz
```

Or source a template directly after setting env vars (wrapper preferred).

## Relation to Atlas product

Atlas MVP default is **passive** web presence (`web.passive.presence.v1`). This `ops/recon` tree is **operator-side** tooling for when a signed engagement expands scope beyond the product’s passive controls. It does not bypass Policy Guard.
