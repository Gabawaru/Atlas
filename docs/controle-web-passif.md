# Contrôle web passif — limites

Module `web.passive.presence.v1` — **in-scope uniquement**, Policy Guard, pas de scan agressif.

## Ce qui est observé (utile au rapport démo)

| Observation | Limite |
|-------------|--------|
| DNS (A/AAAA/NS/MX/TXT) | Pas d’énumération brute ; hôtes **devinés non résolus** exclus du rapport |
| TLS certificat | Port 443, pas de fuzzing ; **non tenté** si IP privée ; alerte expiration si **&lt;14 j** ou renouvellement **non** auto (LE/ACME 90 j ≠ medium à 45 j) |
| Headers sécu (HSTS, CSP, XFO, …) | Lecture seule sur l’**URL finale** après 301 ; `api.*` / JSON : skip CSP+XFO (garder HSTS + X-CTO) ; HSTS présent avec `max-age` &lt; 180 j (ou sans `max-age`) → risque faible |
| **Cookies** (`Secure` / `HttpOnly` / `SameSite`) | Flags Set-Cookie seulement |
| **Redirects** | Max **5** hops ; suivi www→apex ; **arrêt** si Location hors scope |
| RDAP apex | Bootstrap **IANA dns.json** → serveur TLD (ex. Verisign `.com`) ; pas de WHOIS agressif |
| Cloudflare | Si edge CF détecté → note **origine non analysée** |
| Sous-domaines `www` / `mail` / `api` | Seulement si parent in-scope et non exclu |
| **Post-DNS private-IP deny** | Si A/AAAA ∈ loopback / RFC1918 / link-local / ULA / metadata → pas de HTTP/TLS (`PRIVATE_IP_DENIED`) |

## Ce qui n’est pas fait

Crawl, login, injection, fuzzing, port-scan, découverte hors RoE, connect vers IPs privées après résolution.

Constante code : `WEB_PASSIVE_LIMITS` dans `apps/api/src/control/web-passive.ts`.
