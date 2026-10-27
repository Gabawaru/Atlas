# Recon cheatsheet (placeholders only)

Replace `TARGET_DOMAIN`, `TARGET_IP`, `TARGET_URL`, `OUT_DIR`, `WORDLIST` before use.  
**Never** paste real customer / Pragma / DataPerl hostnames into committed docs.

Require: `export ATLAS_AUTHZ=signed` and prefer `../bin/atlas-recon <cmd>`.

| Goal | Template script |
|------|-----------------|
| DNS / whois | `01-dns.sh` |
| Port scan (nmap) | `02-ports.sh` |
| Subdomain enum + httpx | `03-subdomains.sh` |
| Nuclei (severity templates) | `04-nuclei.sh` |
| Web fuzz (ffuf) | `05-fuzz.sh` |

Default output: `$OUT_DIR` → `ops/recon/targets/<slug>/raw`.
