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
| `apps/api/src/connectors` | Catalogue + grants révocables (web réel, GitHub stub) |
| `apps/api/src/control/web-passive.ts` | Passifs DNS/TLS/headers + OSINT RDAP apex + exclusions RoE |
| `apps/client` / `src-tauri` | Build web + smoke ; stub desktop (pas `tauri build` CI) |
| `pnpm client:smoke` | Vérifie `dist/index.html` + bundles JS |
| `apps/api/src/signatures` | SignatureProvider mock 2 parties (pluggable) |
| Endpoints RoE | `GET/POST /v1/missions/:id/roe`, `POST …/counter-signature` |
| Admin entitlements | `GET /v1/admin/entitlements` — abonnement ≠ autorisation |
| Admin SAV | `GET/POST /v1/admin/tickets`, `PATCH …/tickets/:id/status` — support≠approver |
| Remédiation | `GET /v1/findings`, `PATCH /v1/findings/:id/remediation` |
| Vuln feeds | `GET /v1/vuln/feeds`, `GET /v1/software-components`, `POST /v1/vuln/match` — voir `docs/referentiels-vulnerabilites.md` |
| Assistant | `POST /v1/conversation`, `GET /v1/assistant/usage` — mock/API, plafonds, non-bypass — `docs/assistant-conversationnel.md` |
| Déploiement | `ATLAS_DEPLOY_MODE`, `ATLAS_OFFLINE`, `GET /v1/deploy/mode`, sync journal — `docs/modes-deploiement.md` |
| Rétention | `GET/POST /v1/admin/retention/…` — TTL, legal hold, purge dry-run — `docs/retention-et-purge.md` |
| RLS | Migration `*_rls_tenant` ; `PrismaService.asTenant` / bypass |
| BullMQ | Retry 3×, DLQ `atlas-control-passive-dlq`, kill → failed |

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
