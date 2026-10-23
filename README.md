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
apps/client       React — 5 besoins (états honnêtes), connecteurs, conversation mock, bilans
apps/client/src-tauri  Stub documenté Tauri (desktop reporté)
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

# 5) Vérification automatisée (option tout-en-un)
pnpm demo:smoke
# équivalent : build packages + migrate + seed + test:unit + test:acceptance + smoke
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
| `billing@a.atlas.local` | Staff billing |
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

## Tests

```bash
pnpm test:unit
pnpm --filter @atlas/api run test:e2e
pnpm test:acceptance    # AC-01…AC-12
pnpm smoke              # Postgres + Redis
pnpm demo:smoke         # checklist vérif complète
```

### Suite d’acceptation (AC plan)

```bash
pnpm db:migrate && pnpm db:seed
pnpm test:acceptance
```

| AC | Vérifié |
|----|---------|
| AC-02 / 03 / 04 | Sans owner / seule approbation A / seul abonnement → `REJECT` |
| AC-05 | Policy Guard sans LLM |
| AC-06 | Expiration, révocation, scope |
| AC-07 | `verify_chain` + UPDATE simulée détectée |
| AC-08 | Exports JSON/CSV/PDF FICTIF |
| AC-09 | RBAC 5 rôles ; support/billing ≠ approver |
| AC-10 | Sans route → `BLOCKED` ; démo → `A_SKIPPED_DEMO` |
| AC-01 / 11 / 12 | Transitions, module hors jeton, marqueurs démo |
| + | Hors périmètre, cancel, rate limit, isolation tenants (si DB) |

## Parcours démo synthétique

1. Client `owner@demo.atlas.local` → mission FICTIVE présence web  
2. Signature mock → `A_SKIPPED_DEMO`  
3. BullMQ → preuves sur `example.com` → `REPORT_AVAILABLE`  
4. Exports JSON/CSV/PDF  
5. Admin : import stub hiérarchie (`isStub`) pour débloquer `NO_APPROVAL_ROUTE`  

## Documentation (FR)

| Doc | Public |
|-----|--------|
| [`docs/utilisateur.md`](docs/utilisateur.md) | Client terrain |
| [`docs/administrateur.md`](docs/administrateur.md) | Staff entreprise A |
| [`docs/developpeur.md`](docs/developpeur.md) | Contributeurs |
| [`docs/limites-et-evolution.md`](docs/limites-et-evolution.md) | Limites honnêtes + suite |
| [`docs/sauvegarde-maj-incidents.md`](docs/sauvegarde-maj-incidents.md) | Backup, maj, incidents MVP |
| [`docs/exemples/`](docs/exemples/) | Rapport FICTIF versionné |
| [`docs/tauri-stub.md`](docs/tauri-stub.md) | Desktop reporté |

## Connecteurs (MVP)

- **Présence web** (`web.passive.presence`) — réel, révocable, requis par Policy Guard avant exécution
- **GitHub lecture seule** (`github.read_only`) — stub mock OAuth, **non production**, aucune exécution de contrôle
- Conversation mock : oriente vers besoins/connecteurs **sans** contourner le Policy Guard

## Hors scope de ce MVP (honnête)

- OIDC / SSO réel ; e-sign / eIDAS réel (mock seulement)
- Hiérarchie d’approbation **réelle** A
- OAuth GitHub réel, réseau interne, CVE feeds, PSP
- Shell Tauri empaqueté ; HA BullMQ ; RLS Postgres durcie
- Analyse de contrats, scans agressifs

---

*Atlas MVP — données de démonstration uniquement. Ne constitue pas un avis juridique ni une certification de légalité.*
