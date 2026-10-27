# Install status (this VM / Cloud Agent image)

Recorded during toolkit setup. Re-run commands on a fresh host as needed.

## Succeeded

| Tool | Source | Version check | Binary |
|------|--------|---------------|--------|
| dig | apt `dnsutils` / `bind9-dnsutils` | `dig -v` | `/usr/bin/dig` |
| whois | apt `whois` | `whois --version` | `/usr/bin/whois` |
| nmap | apt `nmap` | `nmap --version` | `/usr/bin/nmap` |
| whatweb | apt `whatweb` | `whatweb --version` | `/usr/bin/whatweb` |
| subfinder | `go install …/subfinder/v2/cmd/subfinder@latest` | `subfinder -version` | `$GOPATH/bin/subfinder` (~v2.17) |
| httpx | `go install …/httpx/cmd/httpx@latest` | `httpx -version` | `$GOPATH/bin/httpx` |
| nuclei | `go install …/nuclei/v3/cmd/nuclei@latest` | `nuclei -version` | `$GOPATH/bin/nuclei` (~v3.11) |
| ffuf | `go install github.com/ffuf/ffuf/v2@latest` | `ffuf -V` | `$GOPATH/bin/ffuf` (~2.1) |

Go toolchain present: `go1.22.2`. Default `GOPATH=$HOME/go`; ensure `export PATH="$PATH:$HOME/go/bin"`.

## Deferred / optional

| Item | Notes |
|------|--------|
| nuclei templates sync | Do **not** auto-pull in CI. Operator runs `nuclei -update-templates` only on an authorized workstation after RoE. |
| wordlists (SecLists, etc.) | Not bundled. Point `WORDLIST` at a local path when fuzzing is in scope. |
| System-wide symlink of Go bins | Left in `$HOME/go/bin` to avoid polluting `/usr/local` without consent. |

## Fresh-host install commands

```bash
# apt
sudo apt-get update
sudo apt-get install -y nmap whois dnsutils whatweb

# go CLIs (requires Go ≥ 1.21)
export PATH="$PATH:$(go env GOPATH)/bin"
go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install github.com/projectdiscovery/httpx/cmd/httpx@latest
go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
go install github.com/ffuf/ffuf/v2@latest
```

## Safety

Do not run scan templates against any host unless `ATLAS_AUTHZ=signed` and written authorization covers that target. See [README.md](./README.md).
