# Atlas axe 4 — passive ZAP × OWASP Top 10

| | |
|---|---|
| Stamp | `20261112T095050Z` |
| ZAP | 2.17.0 |
| RoE | `*-dev.pragma-cloud.com` only · GET requestor · no spider/active/mutations |
| High / Med / Low / Info | **0** / **0** / **7** / **0** |

## Hosts

- `gtm-dev.pragma-cloud.com`
- `preview-dev.pragma-cloud.com`
- `staging-dev.pragma-cloud.com`
- `demo-dev.pragma-cloud.com`
- `serve-dev.pragma-cloud.com`
- `pragma-dev.pragma-cloud.com`
- `atlas-dev.pragma-cloud.com`

## OWASP Top 10 (2021)

| Category | Count |
|---|---:|
| A01:2021 Broken Access Control | 0 |
| A02:2021 Cryptographic Failures | 0 |
| A03:2021 Injection | 0 |
| A04:2021 Insecure Design | 0 |
| A05:2021 Security Misconfiguration | 7 |
| A06:2021 Vulnerable and Outdated Components | 0 |
| A07:2021 Identification and Authentication Failures | 0 |
| A08:2021 Software and Data Integrity Failures | 0 |
| A09:2021 Security Logging and Monitoring Failures | 0 |
| A10:2021 Server-Side Request Forgery (SSRF) | 0 |

## Findings

| Risk | OWASP | Source | Host | Alert | CWE |
|---|---|---|---|---|---|
| low | A05:2021 | zap-passive | `gtm-dev.pragma-cloud.com` | Strict-Transport-Security Header Not Set | 319 |
| low | A05:2021 | zap-passive | `preview-dev.pragma-cloud.com` | Strict-Transport-Security Header Not Set | 319 |
| low | A05:2021 | zap-passive | `staging-dev.pragma-cloud.com` | Strict-Transport-Security Header Not Set | 319 |
| low | A05:2021 | zap-passive | `demo-dev.pragma-cloud.com` | Strict-Transport-Security Header Not Set | 319 |
| low | A05:2021 | zap-passive | `serve-dev.pragma-cloud.com` | Strict-Transport-Security Header Not Set | 319 |
| low | A05:2021 | zap-passive | `pragma-dev.pragma-cloud.com` | Strict-Transport-Security Header Not Set | 319 |
| low | A05:2021 | zap-passive | `atlas-dev.pragma-cloud.com` | Strict-Transport-Security Header Not Set | 319 |

## Notes

- pragma-serve.com (prod) header issues are real but origin fixes are Pragma-side — this report focuses on Atlas tooling + *-dev baseline.
- Default host list excludes client-brand product slugs (no client data).
- Static findings: pass ATLAS_ZAP_STATIC_JSON / --static-json when make-secure emits a JSON bundle (grouped into the same OWASP buckets).
- Source ZAP JSON: zap-baseline-dev-20261112T095050Z.json
