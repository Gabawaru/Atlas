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

- **Pas de secrets Paradise / Sign** touchés — clés optionnelles shortlist via `.env` (voir `.env.example`).
- **Pas d’exploits** — adapters passifs / auth read-only / locaux / `needs_config` / `blocked`.
- Catalogue HTTP : `GET /v1/modules` (auth).
- Clés absentes → `needs_config` avec `evidence.requiredEnv` (jamais de secrets inventés).

## Statuts

| wireStatus | Signification |
| --- | --- |
| `wired` | Adapter exécutable (live si clés/binaire ; sinon `needs_config` / `binary_missing`) |
| `stub` | Réservé (aucun après pass d’adapters) |
| `blocked` | Contrainte policy/architecture — non exécutable |

**Compte courant :** 93 wired · 0 stub · **1 blocked** (`breach.google-password-checkup.auth.v1` — pas d’API entreprise / export).

Code : `apps/api/src/control/modules/` (`passive-api.ts`, `local-analyzers.ts`, `auth-api.ts`).

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

Autres modules wired (SaaS/auth/enrolled/lab) : opt-in via `suiteModuleIds` sur le job — **pas** dans la suite passive par défaut.

## Suite locale

Si `localPath` est fourni sur le job BullMQ : Trivy, Gitleaks, TruffleHog, OSV, Grype, Syft, Checkov, Semgrep, Bandit, Conftest.  
CLI additionnels (wired, opt-in) : fwupd, Prowler, kube-bench, Kubescape, CodeQL, OpenSCAP, NeMo Guardrails, **Falco rules lint** (`falco --validate`), **CHIPSEC** (lab flag + privileged worker).

## Labs gated

| Flag | Modules | Comportement |
| --- | --- | --- |
| `ATLAS_PHISH_LAB_APPROVED` | gophish / knowbe4 / proofpoint | Lecture métriques uniquement — jamais d’envoi |
| `ATLAS_CHIPSEC_LAB_APPROVED` | chipsec | Privileged owned hardware / self-hosted only |
| `ATLAS_CHAOS_LAB_APPROVED` | chaos-mesh / litmus / aws-fis / gremlin | Catalog/readiness only — **jamais** d’injection ; Policy Guard marque encore `chaos.*` agressif sans authz Circuit A signée |

## Policy block restant

| Module | Pourquoi | Déblocage minimal |
| --- | --- | --- |
| `breach.google-password-checkup.auth.v1` | UI Google Password Manager — pas d’API/export entreprise | Export Workspace admin + ingest URL, ou rester sur HIBP / Pwned Passwords. **Jamais** scraper accounts.google.com |

## Connecteurs

- `asm.passive.enrichment`
- `breach.hibp`
- `ti.passive.enrichment`
- `sca.local.analyzers`
- `cloud.posture.auth`
- `github.read_only` (`productionReady: true` — Dependabot + secret-scanning)
- `saas.auth.enrichment`

Voir le rapport d’intégration projet `docs/atlas-shortlist-modules-integration.md` (Agent Store).
