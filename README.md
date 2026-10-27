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

## Checklist install (courte)

```bash
docker compose up -d          # Postgres + Redis
cp -n .env.example .env
pnpm install
pnpm demo:smoke               # ~5 s à chaud (mesuré) ; docs/demo-smoke.md
```

`demo:smoke` = build packages si besoin + smoke (migrate/seed/e2e). **Pas** de unit/AC ici.  
CI : `pnpm test:unit` + `pnpm test:acceptance`. Exit **77** = infra absente.

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

Guides : [`utilisateur`](docs/utilisateur.md) · [`administrateur`](docs/administrateur.md) · [`developpeur`](docs/developpeur.md) · [`demo-smoke`](docs/demo-smoke.md) · [`limites`](docs/limites-et-evolution.md) · [`sauvegarde-maj`](docs/sauvegarde-maj-incidents.md) · [`exemples/`](docs/exemples/).  
Détail modules : `docs/controle-web-passif.md`, `import-hierarchie.md`, `licences-abonnements.md`, `assistant-conversationnel.md`, `referentiels-vulnerabilites.md`, `modes-deploiement.md`, `retention-et-purge.md`, `versions-et-maintenance.md`, `tauri-stub.md`.  
Stage CNED / DataPerl : [`STAGE.md`](STAGE.md) · [`docs/stage/`](docs/stage/).

## Stage DataPerl (CNED BTS CIEL) — Gabriel Carbunaru

Période : 28 sept. – 20 nov. 2026 · Tuteur : Benjamin Mathias (DataPerl SASU).

**Atlas** est l’outil **interne** de vérification sécurité / scanner (missions stage 3–5).  
Ce n’est **pas** la plateforme publique Pragma Serve.

| Axe annexe | Couverture Atlas |
|------------|------------------|
| 3 `make secure` | CI / analyses SAST-secrets-deps — [`docs/stage/make-secure.md`](docs/stage/make-secure.md) (outils encore TBD) |
| 4 Scanner OWASP + rapport | Policy Guard + exports — [`docs/stage/owasp-rapport.md`](docs/stage/owasp-rapport.md) |
| 5 Durcissement | Suivi findings / limites — [`docs/limites-et-evolution.md`](docs/limites-et-evolution.md) |
| 1 / 7 | Tests plateforme & wiki : support / doc ; pas le produit public |
| 2 / 6 | Hors repo (clients / partenariat) |

**Confidentialité :** secret professionnel (convention Art. 3). Aucune donnée client réelle ni secret dans le dépôt public / issues / samples. Scans hors cible autorisée interdits ; agressif / exploit uniquement avec autorisation écrite ([`docs/modele-autorisation-pentest.md`](docs/modele-autorisation-pentest.md)).

**D1** (cahier des charges) : [`docs/stage/d1-cahier-des-charges.md`](docs/stage/d1-cahier-des-charges.md).  
**Livrables CNED hors code** (journal, certificat, rapport de stage) : pointeurs dans [`STAGE.md`](STAGE.md) — ne pas versionner les PDF nominatifs ici.

Détail axes + mapping fichiers : [`STAGE.md`](STAGE.md).

## Hors scope (honnête)

Voir [`docs/limites-et-evolution.md`](docs/limites-et-evolution.md). En résumé : pas d’OIDC/e-sign/hiérarchie RH réelle/cloud UE ; OAuth GitHub réel et PSP reportés ; feeds vulns **live** et durcissement RLS prod hors MVP (les feeds passifs + RLS FORCE sont déjà livrés).

---

*Atlas MVP — données de démonstration uniquement. Voir limites — pas un avis juridique. Cadre stage : [`STAGE.md`](STAGE.md).*
