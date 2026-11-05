# Shortlist modules — intégration Atlas

Cartographie des **94 outils** du shortlist défensif vers des **modules Atlas** coopératifs (contrat mission / rapport / Policy Guard partagé).

## Architecture

```
Mission (Circuit A + Paradise owner authz + RoE)
    → Policy Guard (parent: web.passive.presence.v1)
    → BullMQ job web.passive.presence.v1
        → runWebPassivePresence (DNS/HTTP/TLS/RDAP)
        → runCooperatingSuite (shortlist adapters)
        → findings + report unifié (presence + suite)
```

- **Pas de secrets Paradise / Sign** touchés — clés optionnelles shortlist via `.env` (`HIBP_API_KEY`, `VT_API_KEY`, …).
- **Pas d’exploits** — adapters passifs / locaux / `needs_config` / `blocked` uniquement.
- Catalogue HTTP : `GET /v1/modules` (auth).

## Statuts

| wireStatus | Signification |
| --- | --- |
| `wired` | Adapter exécutable dans la suite (API publique, DNS, ou CLI local) |
| `stub` | Entrée catalogue + connecteur ; renvoie `needs_config` jusqu’à clés/agent |
| `blocked` | Non branchable sous contraintes Atlas (enrollment, agents endpoint, chaos, HR/legal, etc.) |

Code : `apps/api/src/control/modules/`.

## Suite passive par défaut

Exécutée après la présence web (sauf `skipSuite`) :

- `asm.crtsh.passive.v1`
- `asm.urlscan.passive.v1`
- `web.observatory.passive.v1`
- `web.securityheaders.passive.v1`
- `web.ssllabs.passive.v1`
- `email.mail-auth.dns.passive.v1`
- `ti.otx.passive.v1`
- `ti.virustotal.passive.v1`
- `breach.hibp.passive.v1`

## Suite locale

Si `localPath` est fourni sur le job BullMQ : Trivy, Gitleaks, TruffleHog, OSV, Grype, Syft, Checkov, Semgrep, Bandit, Conftest.

## Connecteurs ajoutés

- `asm.passive.enrichment`
- `breach.hibp`
- `ti.passive.enrichment`
- `sca.local.analyzers`
- `cloud.posture.auth` (stub)

Voir aussi le rapport d’intégration projet (store) `docs/atlas-shortlist-modules-integration.md`.
