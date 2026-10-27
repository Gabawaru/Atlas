# Contrôle web passif — limites

Module `web.passive.presence.v1` — **in-scope uniquement**, Policy Guard, pas de scan agressif.

## Ce qui est observé (utile au rapport démo)

| Observation | Limite |
|-------------|--------|
| DNS (A/AAAA/NS/MX/TXT) | Pas d’énumération brute |
| TLS certificat | Port 443, pas de fuzzing ; **non tenté** si IP privée |
| Headers sécu (HSTS, CSP, XFO, …) | Lecture seule |
| **Cookies** (`Secure` / `HttpOnly` / `SameSite`) | Flags Set-Cookie seulement |
| **Redirects** | Max **5** hops ; **arrêt** si Location hors scope |
| RDAP apex | Une GET publique ; pas de WHOIS agressif |
| Sous-domaines `www` / `mail` / `api` | Seulement si parent in-scope et non exclu |
| **Post-DNS private-IP deny** | Si A/AAAA ∈ loopback / RFC1918 / link-local / ULA / metadata → pas de HTTP/TLS (`PRIVATE_IP_DENIED`) |

## Ce qui n’est pas fait

Crawl, login, injection, fuzzing, port-scan, découverte hors RoE, connect vers IPs privées après résolution.

Constante code : `WEB_PASSIVE_LIMITS` dans `apps/api/src/control/web-passive.ts`.
