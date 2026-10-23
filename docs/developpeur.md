# Guide développeur — Atlas MVP

Stack hypothèse : monorepo **pnpm**, NestJS API, Next admin, Vite client, Postgres, Redis/BullMQ, packages `shared` + `policy-guard`.

## Démarrage local

Voir la **checklist install** du `README.md` racine (commandes testées). Résumé :

```bash
cp .env.example .env
docker compose up -d          # Postgres + Redis
pnpm install
pnpm --filter @atlas/shared build
pnpm --filter @atlas/policy-guard build
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev:api                  # :3001
pnpm dev:admin                # :3000
pnpm dev:client               # :3002
```

Smoke tout-en-un :

```bash
pnpm demo:smoke
```

## Layout

| Chemin | Rôle |
|--------|------|
| `apps/api` | API `/v1`, Prisma, BullMQ worker, exports |
| `apps/admin` | Console A |
| `apps/client` | UI client web (+ `src-tauri` stub) |
| `packages/policy-guard` | `evaluateExecution` — **sans LLM** |
| `packages/shared` | États mission, types |
| `docs/` | Guides FR + exemples de rapports |

## Tests

```bash
pnpm test:unit
pnpm test:e2e
pnpm test:acceptance   # AC-01…AC-12
pnpm smoke             # Postgres + Redis
```

Régénérer l’exemple de rapport versionné :

```bash
pnpm --filter @atlas/api exec tsx scripts/generate-exemple-rapport.ts
```

## Règles dures (code)

1. Tout contrôle actif passe par Policy Guard + jeton — jamais via le LLM.
2. Cibles hors `allowedHosts` → exception `TARGET_OUT_OF_SCOPE`.
3. `AuditService` : append-only (pas d’API update/delete).
4. `SignatureProvider` : interface pluggable ; implémentation runtime = **mock**.
5. Secrets : jamais dans les logs ni le LLM (MVP : pas de coffre Vault réel).

## Migrations

```bash
pnpm --filter @atlas/api exec prisma migrate deploy
# Dev : prisma migrate dev --name <nom>
```

## Variables utiles

| Variable | Rôle |
|----------|------|
| `DATABASE_URL` | Postgres |
| `REDIS_URL` | BullMQ |
| `JWT_SECRET` | Auth locale (dev only dans `.env.example`) |
| `ATLAS_FORCE_MOCK_NETWORK` | `true` = mocks DNS/HTTP (CI offline) |

## Hors scope code (ne pas « finir » en silence)

OIDC, e-sign réel, workers HA, RLS Postgres stricte, modules réseau agressifs, Tauri packagé.
