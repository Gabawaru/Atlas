# Référentiels vulnérabilités (passifs) — Atlas MVP

Matching **version → finding** à partir de sources publiques.  
**Pas de scan agressif**, pas d’exploitation, pas de confirmation runtime.

## Principe

> **Une correspondance de version ne confirme pas une vulnérabilité.**  
> **Confiance** (qualité du matching) **≠** **gravité** (CVSS / KEV).

| Axe | Signification |
|-----|----------------|
| `severity` | Gravité déclarée par le feed (critical…info) |
| `confidence` | Fiabilité de l’association package+version → CVE (`low` \| `medium` \| `high`) |
| `kevListed` | Présence dans le catalogue CISA KEV (signal d’exploitation *connue dans le catalogue*, pas sur votre cible) |

## Sources

| Feed | Usage MVP | Licence / conditions | Fraîcheur |
|------|-----------|----------------------|-----------|
| **OSV** | Query package+version | Agrégat multi-sources — voir chaque entrée | Cache local TTL ~12 h |
| **NVD** | Enrichissement sévérité (clé `NVD_API_KEY` opt-in) | Conditions NIST/NVD | Cache ~24 h ; rate limit strict |
| **CISA KEV** | Flag `kevListed` | Domaine public US | Cache ~6 h |

Mode défaut : **`fixture`** (catalogue embarqué) — CI et démo sans appels réseau.  
Live : `ATLAS_VULN_FEEDS_MODE=live` (opt-in) + cache disque `storage/vuln-cache/` + rate limit mémoire.

## Inventaire

- Seed FICTIF : `openssl@1.0.2k`, `nginx@1.14.0`, `log4j-core@2.14.1`
- Observation passive : bannière `Server` HTTP du module présence web (pas de fingerprinting actif)

API :

- `GET /v1/vuln/feeds` — mode, licences, disclaimer
- `GET /v1/software-components` — inventaire tenant
- `POST /v1/vuln/match` — rejoue le matching (owner/operator)

## Limites honnêtes

- Pas de preuve que le composant est réellement chargé / joignable
- Pas de différenciation build/config (ex. nginx sans HTTP/2)
- Fixtures ≠ miroir exhaustif NVD
- Pas d’OIDC / e-sign / hiérarchie A dans cette tranche
