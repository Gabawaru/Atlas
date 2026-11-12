# Axe 4 — passive ZAP baseline (dev-only) × OWASP

**RoE:** only `*-dev.pragma-cloud.com` · GET requestor · no spider / ajax / active scan · no mutations · no client data (default list = platform/tooling names).

## Run

```bash
# ZAP install (zap.sh) or Docker zaproxy/zap-stable
export ATLAS_ZAP_HOME=/path/to/ZAP_2.17.0   # optional if docker available
pnpm security:zap-dev
```

Outputs under `docs/security/reports/`:

| File | Role |
| --- | --- |
| `zap-baseline-dev-<stamp>.json` | Raw ZAP traditional-json |
| `axe4-zap-owasp-report.md` / `.html` | Visual OWASP-mapped report (latest) |
| `axe4-zap-owasp-<stamp>.*` | Timestamped copies + `.summary.json` |

Optional static merge (make-secure / SAST):

```bash
ATLAS_ZAP_STATIC_JSON=/path/to/static-findings.json pnpm security:zap-dev
```

Static JSON shape: `{ "findings": [{ "title", "severity", "ruleId?", "cwe?", "file?" }] }`.

## Hosts

Edit `scripts/security/dev-hosts.default.txt` or set `ATLAS_ZAP_HOSTS_FILE`. Any host not matching `*-dev.pragma-cloud.com` is **refused**.

## Notes

- Prod `pragma-serve.com` header findings remain real; origin fixes are Pragma-side — this axe focuses Atlas scan/report tooling.
- Pair with axe 3 (`make-secure` CI) via `--static-json` when that gate emits a bundle.
