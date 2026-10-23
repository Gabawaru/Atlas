# Atlas

Assistant conversationnel de **pentest autorisé** (entreprise A), accessible aux non-spécialistes.

Ce dépôt contient le **MVP vertical** : monorepo installable, Policy Guard déterministe (sans LLM), machine d’états mission, présence web passive bornée, consoles client & admin minimales, seeds fictives.

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
apps/api          NestJS — auth locale, missions, admin approvals, module web passif
apps/admin        Next.js — file d’approbation + config routage (stub)
apps/client       React (Vite) — 5 besoins UX, conversation mock, mission, bilans
apps/client/src-tauri  Stub documenté Tauri (desktop reporté)
packages/shared   Types, états mission, transitions
packages/policy-guard  evaluateExecution() déterministe + tests sans LLM
docker-compose.yml     Postgres 16 + Redis 7
```

## Prérequis

- Node.js ≥ 20
- [pnpm](https://pnpm.io) 9 (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- Docker (pour Postgres + Redis)

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

## Lancer

```bash
# terminaux séparés, ou :
pnpm dev:api      # http://localhost:3001/v1/health
pnpm dev:admin    # http://localhost:3000
pnpm dev:client   # http://localhost:3002
```

Variables : voir `.env.example` (aucun secret réel).

## Tests

```bash
# Unitaires (toujours, sans Docker) — Policy Guard + états mission + web passif
pnpm test:unit

# E2e logique sans DB
pnpm --filter @atlas/api run test:e2e

# Smoke Docker (Postgres requis) — parcours démo → rapport
pnpm smoke
# code 77 = infra absente (skip soft) ; 0 = OK ; 1 = échec
```

## Parcours démo synthétique

1. Client : login `owner@demo.atlas.local` → conversation → mission FICTIVE présence web.
2. Autorisation propriétaire (stub signature) → `A_SKIPPED_DEMO` (pas d’approbateur réel requis).
3. Policy Guard `ALLOW` → contrôle passif mock → `REPORT_AVAILABLE` (bilan décideur + technique).
4. Admin : file d’approbation pour missions réelles routées ; import stub hiérarchie clairement marqué `isStub`.

Mission **réelle** sans policy de routage → statut `BLOCKED` / `NO_APPROVAL_ROUTE`.

## Module de contrôle MVP

`web.passive.presence.v1` : résolution DNS + HEAD HTTP sur hôtes du **scope approuvé uniquement**, rate limit, cancel. Pas de fuzzing, pas de crawl agressif, pas hors périmètre.

## Hors scope de ce MVP (honnête)

- OIDC / SSO réel (auth locale seedée seulement)
- Signatures eIDAS / prestataire e-sign réel (stub `isStubSignature`)
- Hiérarchie d’approbation **réelle** entreprise A (config métier)
- Connecteurs authentifiés, réseau interne, CVE feeds, PSP
- Shell Tauri empaqueté (stub documenté)
- Redis/BullMQ workers distribués (Redis dans compose pour la suite ; exécution sync in-process au MVP)
- PDF/CSV exports complets (JSON bilan présent)

## Documentation produit

Les docs d’exigences / architecture / workflow vivent dans le contexte projet Atlas (hors ce README). Point d’entrée technique : ce fichier + `docs/tauri-stub.md`.

---

*Atlas MVP — données de démonstration uniquement. Ne constitue pas un avis juridique ni une certification de légalité.*
