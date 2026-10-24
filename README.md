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
apps/api          NestJS — auth, missions, BullMQ, exports, connecteurs, SignatureProvider mock
apps/admin        Next.js — file d’approbation + config routage (stub)
apps/client       React — 5 besoins, connecteurs, conversation mock, bilans ; `pnpm client:smoke`
apps/client/src-tauri  Stub Tauri 2 (conf + cargo message-only ; pas de bundle signé)
packages/shared   Types, états mission, UX needs, transitions
packages/policy-guard  evaluateExecution() déterministe + tests sans LLM
docker-compose.yml     Postgres 16 + Redis 7 (requis pour BullMQ)
docs/             Guides FR + exemples de rapports FICTIFS
```

## Prérequis

- Node.js ≥ 20
- [pnpm](https://pnpm.io) 9 (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- Docker (Postgres + Redis) — Redis **requis** pour la file d’exécution

## Checklist install reproductible (testée)

Cocher dans l’ordre — commandes exactes validées sur ce dépôt :

```bash
# 0) Prérequis
node -v                    # >= 20
corepack enable && corepack prepare pnpm@9.15.0 --activate
docker compose version     # ou Docker Desktop / engine

# 1) Config (aucun secret réel)
cp .env.example .env

# 2) Infra
docker compose up -d
# Attendre healthy : postgres :5432, redis :6379

# 3) Dépendances + packages partagés
pnpm install
pnpm --filter @atlas/shared build
pnpm --filter @atlas/policy-guard build

# 4) Base de données
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 5) Vérification automatisée courte
pnpm demo:smoke
# = build packages + migrate + seed + smoke e2e
# CI : pnpm test:unit && pnpm test:acceptance
```

**Attendu `demo:smoke` / `smoke` :** message `Smoke e2e OK` (exit 0). Exit **77** = Postgres ou Redis injoignable.

### Lancer les UIs après install

```bash
pnpm dev:api      # http://localhost:3001/v1/health
pnpm dev:admin    # http://localhost:3000
pnpm dev:client   # http://localhost:3002
```

Comptes seed (mot de passe `atlas-demo`) — **fictifs** :

| Email | Rôle |
|-------|------|
| `owner@demo.atlas.local` | Client owner (tenant démo) |
| `approver@a.atlas.local` | Staff approver |
| `support@a.atlas.local` | Staff support (ne peut pas approuver) |
| `billing@a.atlas.local` | Staff billing (licences stub ; pas de données sécu) |
| `ops@a.atlas.local` | Staff ops |
| `admin@a.atlas.local` | Staff admin |

Actif seed : `example.com` (preuves DNS/HTTP publiques dans le scope ; missions/exports marqués **FICTIF**).

Variables : `.env.example` — `REDIS_URL`, `ATLAS_FORCE_MOCK_NETWORK` (mocks réseau CI).

## Exécution & rapports

1. Policy Guard `ALLOW` → job BullMQ `atlas-control-passive`
2. Progression, **cancel**, **kill**, rate limit
3. Module `web.passive.presence.v1` — DNS/HTTP/TLS passifs, allowlist scope
4. Bilans décideur / technique + exports JSON/CSV/PDF
5. SignatureProvider **mock** (pas eIDAS)

Endpoints : `POST …/execute|cancel|kill`, `GET …/jobs/:id`, `GET …/reports/:id/export?format=…`

Exemple versionné : [`docs/exemples/`](docs/exemples/) (`pnpm docs:exemple-rapport` pour régénérer).

## CI (GitHub Actions)

Workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) sur `push` / `pull_request` vers `main` (et pushes `cursor/**`) :

1. pnpm 9.15 + Node 20  
2. Services **Postgres 16** + **Redis 7** (healthchecks)  
3. `pnpm install --frozen-lockfile`  
4. Build `@atlas/shared` + `@atlas/policy-guard`  
5. `pnpm db:generate` + `pnpm db:migrate` + `pnpm db:seed`  
6. `pnpm test:unit` puis `pnpm test:acceptance`  

Variables CI (alignées `.env.example`) : `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (valeur CI uniquement), `ATLAS_FORCE_MOCK_NETWORK=true`.

**RLS Postgres :** politiques FORCE multi-tenant ; rôle `atlas_app` (NOSUPERUSER, créé en migration — **ne pas** `ALTER ROLE atlas` sur GHA) ; `ATLAS_RLS_DATABASE_URL` pour les tests d’isolation ; seed via `atlas` + `app.bypass_rls=on`.  
**BullMQ :** retry 3× + backoff, DLQ `atlas-control-passive-dlq`, kill → failed + DLQ.

En local, la même séquence équivaut à la checklist ci-dessus + `pnpm test:unit` / `pnpm test:acceptance` (ou `pnpm demo:smoke`). `act` n’est pas requis pour valider ce dépôt.

## Tests

```bash
pnpm test:unit
pnpm --filter @atlas/api run test:e2e
pnpm test:acceptance    # AC-01…AC-12
pnpm smoke              # Postgres + Redis
pnpm demo:smoke         # smoke court (pas unit/AC)
pnpm client:smoke       # build web + dist
```

AC : `pnpm test:acceptance` (AC-01…AC-12 — voir `docs/developpeur.md`).

## Parcours démo

1. Client `owner@demo.atlas.local` → mission FICTIVE présence web  
2. Signature mock → `A_SKIPPED_DEMO` → BullMQ → rapport  
3. Admin : import stub/CSV pour débloquer missions **réelles** (`NO_APPROVAL_ROUTE`)

## Documentation (FR)

Guides : [`utilisateur`](docs/utilisateur.md) · [`administrateur`](docs/administrateur.md) · [`developpeur`](docs/developpeur.md) · [`limites`](docs/limites-et-evolution.md) · [`sauvegarde-maj`](docs/sauvegarde-maj-incidents.md) · [`exemples/`](docs/exemples/).  
Détail modules : `docs/controle-web-passif.md`, `import-hierarchie.md`, `licences-abonnements.md`, `assistant-conversationnel.md`, `referentiels-vulnerabilites.md`, `modes-deploiement.md`, `retention-et-purge.md`, `versions-et-maintenance.md`, `tauri-stub.md`.

## Hors scope (honnête)

Voir [`docs/limites-et-evolution.md`](docs/limites-et-evolution.md). En résumé : pas d’OIDC/e-sign/hiérarchie RH réelle/cloud UE ; OAuth GitHub réel et PSP reportés ; feeds vulns **live** et durcissement RLS prod hors MVP (les feeds passifs + RLS FORCE sont déjà livrés).

---

*Atlas MVP — données de démonstration uniquement. Voir limites — pas un avis juridique.*
