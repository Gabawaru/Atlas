# Rétention & purge — Atlas MVP

> **Hypothèses de conception FR/RGPD.**  
> Ce document **n’est pas** une certification CNIL, une AIPD, une base légale validée ni un avis d’avocat.  
> À faire valider par le **DPO / conseil** d’A avant tout usage production.

Alignement indicatif : store `modele-donnees.md` §6 (R4–R6).

## TTL par catégorie (défauts)

| Catégorie | Env | Défaut (jours) | Action de purge |
|-----------|-----|----------------|-----------------|
| `audit` | `ATLAS_TTL_AUDIT_DAYS` | 365 | Comptage ; purge physique opt-in (`forceAuditPurge`) |
| `reports` | `ATLAS_TTL_REPORTS_DAYS` | 365 | Suppression DB + fichier PDF |
| `artefacts` | `ATLAS_TTL_ARTEFACTS_DAYS` | 365 | `evidenceJson` remplacé par marqueur purged |
| `pii_minimized` | `ATLAS_TTL_PII_DAYS` | 180 | Scrub `Finding.technical` si motifs PII-like |
| `llm_usage` | `ATLAS_TTL_LLM_DAYS` | 90 | Suppression `LlmUsageLog` |

## Legal hold

Sur `Tenant` : `legalHold`, `legalHoldReason`, `legalHoldAt`.

- **Actif** → le job de purge **ne supprime rien** (`heldSkipped: true`), même en dry-run.
- API : `POST /v1/admin/retention/tenants/:id/legal-hold` (admin/ops).

## Job de suppression contrôlée

- `GET /v1/admin/retention/policy` — TTL + disclaimer  
- `POST /v1/admin/retention/tenants/:id/purge` — **dry-run par défaut** (`dryRun: false` pour exécuter)  
- `GET /v1/admin/retention/tenants/:id/runs` — historique `PurgeRun`

Chaque run est journalisé (audit + table `PurgeRun`).

## PII minimisée

Pas un moteur OCR/NLP : heuristique simple sur le champ technique des findings (email, password, bearer…).  
**Hypothèse de minimisation**, pas une garantie d’effacement exhaustif.

## Hors scope

OIDC, e-sign, hiérarchie A, export/effacement personne concernée bout-en-bout, certification légale.
