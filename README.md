# Atlas

Assistant conversationnel de **pentest autorisé** (entreprise A), accessible aux non-spécialistes.

Ce dépôt contient le **MVP vertical** : monorepo installable, Policy Guard déterministe (sans LLM), machine d’états mission, présence web passive bornée, file BullMQ, exports rapport, consoles client & admin minimales, seeds fictives.

## Principes non négociables

| Principe | Conséquence produit |
|----------|---------------------|
| **Abonnement ≠ autorisation pentest** | Un plan actif ouvre le logiciel, pas l’exécution sur des actifs |
| **Approbation A ≠ autorisation propriétaire** | Les deux sont distincts et tous deux nécessaires pour une mission réelle |
| **L’IA ne s’auto-accorde pas de droits** | Conversation = propositions ; le Policy Guard décide |
| **Pas de hiérarchie A inventée** | Sans routage approbateur → mission réelle `BLOCKED` ; démo synthétique OK |
| **Pas de scans agressifs** | MVP = DNS/HTTP publics passifs, rate-limités, annulables, dans le scope |

## Structure

```
apps/api          NestJS — auth locale, missions, BullMQ, exports, SignatureProvider mock
apps/admin        Next.js — file d’approbation + config routage (stub)
apps/client       React (Vite) — 5 besoins UX, conversation mock, mission, bilans + exports
apps/client/src-tauri  Stub documenté Tauri (desktop reporté)
packages/shared   Types, états mission, transitions
packages/policy-guard  evaluateExecution() déterministe + tests sans LLM
docker-compose.yml     Postgres 16 + Redis 7 (requis pour BullMQ)
```

## Prérequis

- Node.js ≥ 20
- [pnpm](https://pnpm.io) 9 (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- Docker (Postgres + Redis) — Redis **requis** pour la file d’exécution

## Installation reproductible

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm --filter @atlas/shared build
pnpm --filter @atlas/policy-guard build
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Comptes locaux seedés (mot de passe `atlas-demo`) — **fictifs** :

| Email | Rôle |
|-------|------|
| `owner@demo.atlas.local` | Client owner (tenant démo) |
| `approver@a.atlas.local` | Staff approver |
| `support@a.atlas.local` | Staff support (ne peut pas approuver) |
| `billing@a.atlas.local` | Staff billing |
| `ops@a.atlas.local` | Staff ops |
| `admin@a.atlas.local` | Staff admin |

Actif seed : `example.com` (domaine de documentation IANA) pour **preuves DNS/HTTP réelles** dans le scope, tout en marquant la mission / les exports **FICTIF**.

## Lancer

```bash
pnpm dev:api      # http://localhost:3001/v1/health  (nécessite Redis)
pnpm dev:admin    # http://localhost:3000
pnpm dev:client   # http://localhost:3002
```

Variables : voir `.env.example` (aucun secret réel).

- `REDIS_URL` — file BullMQ
- `ATLAS_FORCE_MOCK_NETWORK=true` — mocks réseau (CI offline) ; **absent/false** = sondes DNS/HTTP/TLS réelles sur cibles du scope uniquement

## Exécution & rapports

1. Policy Guard `ALLOW` → job `JobRun` mis en file **BullMQ** (`atlas-control-passive`)
2. Progression (`progressPercent` / `progressMessage`), **cancel** et **kill**
3. Module `web.passive.presence.v1` : DNS A/AAAA, HTTP HEAD (ou GET tronqué), métadonnées TLS, `evidenceHash` — allowlist scope stricte, rate limit
4. Rapport : **bilan décideur** + **détail technique** + exports **JSON / CSV / PDF** (en-tête `X-Atlas-Synthetic` si FICTIF)
5. Autorisation propriétaire via **SignatureProvider** mock pluggable (`mock://…` — pas eIDAS)

Endpoints utiles :

- `POST /v1/missions/:id/execute` — enqueue + attend la fin (MVP)
- `POST /v1/missions/:id/cancel` / `…/kill`
- `GET /v1/missions/:id/jobs/:jobId`
- `GET /v1/missions/:id/reports/:reportId/export?format=json|csv|pdf`

## Tests

```bash
pnpm test:unit
# Policy Guard + transitions + web passif + exports + SignatureProvider mock + audit chain + BullMQ (si Redis)

pnpm --filter @atlas/api run test:e2e
pnpm smoke
# Postgres + Redis requis ; exit 77 si infra absente ; 0 = OK
```

### Suite d’acceptation (AC plan)

Mappe les critères `AC-01`…`AC-12` de `docs/plan-realisation.md` (Project Atlas) :

```bash
# Après migrate + seed (Postgres recommandé pour smoke isolation + audit DB)
pnpm db:migrate && pnpm db:seed
pnpm test:acceptance
```

Couverture automatisée :

| AC | Ce que la suite vérifie |
|----|-------------------------|
| AC-02 / 03 / 04 | Sans owner / seule approbation A / seul abonnement → `REJECT` |
| AC-05 | Policy Guard déterministe (aucun LLM) |
| AC-06 | Expiration, révocation token, scope mismatch / révoqué |
| AC-07 | `verify_chain` OK + détection d’une UPDATE simulée du journal |
| AC-08 | Exports JSON/CSV/PDF marqués FICTIF |
| AC-09 | RBAC : support/billing ne peuvent pas approuver ; 5 rôles |
| AC-10 | Mission réelle sans route → `BLOCKED` ; démo → `A_SKIPPED_DEMO` |
| AC-01 / 11 / 12 | Transitions parcours, module hors jeton, marqueurs démo |
| + | Hors périmètre, cancel, rate limit, isolation tenants (si DB) |

Admin : `GET /v1/admin/audit/verify` (rôles admin/ops).

## Parcours démo synthétique

1. Client : login `owner@demo.atlas.local` → conversation → mission FICTIVE présence web.
2. Autorisation propriétaire (SignatureProvider **mock**) → `A_SKIPPED_DEMO`.
3. Policy Guard `ALLOW` → BullMQ → preuves DNS/HTTP sur `example.com` (scope) → `REPORT_AVAILABLE`.
4. Télécharger JSON/CSV/PDF (marqués synthétiques).
5. Admin (`admin@a.atlas.local`) : **Importer stub hiérarchie** pour un tenant → débloque `NO_APPROVAL_ROUTE` en démo (`isStub`) ; `approver@…` traite la file.

Mission **réelle** sans policy de routage → `BLOCKED` / `NO_APPROVAL_ROUTE`.

## Hors scope de ce MVP (honnête)

- OIDC / SSO réel (auth locale seedée seulement)
- Prestataire e-sign / eIDAS réel (interface pluggable + **mock** seulement)
- Hiérarchie d’approbation **réelle** entreprise A (config métier)
- Connecteurs authentifiés, réseau interne, CVE feeds, PSP
- Shell Tauri empaqueté (stub documenté)
- Workers multi-hôtes / haute dispo BullMQ ; RLS Postgres durcie
- Analyse de contrats, scans agressifs

## Documentation produit

Les docs d’exigences / architecture / workflow vivent dans le contexte projet Atlas. Point d’entrée technique : ce fichier + `docs/tauri-stub.md`.

---

*Atlas MVP — données de démonstration uniquement. Ne constitue pas un avis juridique ni une certification de légalité.*
