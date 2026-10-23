# Sauvegarde, mises à jour, incidents — procédures MVP

Procédures **concrètes** pour l’environnement de démo/dev actuel (Docker Compose Postgres + Redis + API Node).  
Pas un runbook production UE certifié.

## 1. Sauvegarde

### Postgres (données métier + audit)

```bash
# Depuis la machine hôte (compose up)
docker compose exec -T postgres pg_dump -U atlas -d atlas -Fc > backup-atlas-$(date +%Y%m%d).dump

# Restauration (ATTENTION : écrase)
docker compose exec -T postgres pg_restore -U atlas -d atlas --clean --if-exists < backup-atlas-YYYYMMDD.dump
```

Sans Docker (Postgres local) :

```bash
pg_dump -U atlas -d atlas -Fc > backup-atlas.dump
pg_restore -U atlas -d atlas --clean --if-exists backup-atlas.dump
```

### Redis

Redis MVP = files BullMQ (éphémère). Pas de sauvegarde critique : après restore Postgres, les jobs en cours sont perdus — **relancer** les missions si besoin.

### Artefacts rapports

Répertoire runtime : `apps/api/storage/reports/` (gitignored).  
Exemples versionnés : `docs/exemples/`.

```bash
tar -czf reports-$(date +%Y%m%d).tgz -C apps/api storage/reports 2>/dev/null || true
```

### Journal d’audit

Inclus dans le dump Postgres (`AuditEvent`). Vérifier après restore :

```bash
# API démarrée, compte admin
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/v1/admin/audit/verify
```

Attendu : `{ "ok": true, ... }`.

## 2. Mises à jour (MVP)

**Avant** une fenêtre de maj : activer le mode maintenance (bloque les exécutions) — voir `docs/versions-et-maintenance.md`.

```bash
# Maintenance ON (compte ops/admin)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"active":true,"reason":"Fenêtre maj MVP"}' \
  http://localhost:3001/v1/admin/ops/maintenance

git fetch && git checkout main
pnpm install
pnpm --filter @atlas/shared build
pnpm --filter @atlas/policy-guard build
pnpm db:generate
pnpm db:migrate          # migrations Prisma idempotentes
# Ne pas re-seed en prod démo si vous voulez conserver les données :
# pnpm db:seed           # RÉINITIALISE les données FICTIVES
pnpm build               # optionnel
```

Redémarrer API / admin / client.

Après maj : publier une note de version si besoin, puis **lever** la maintenance (`"active":false`).

Checklist post-maj :

```bash
pnpm test:unit
pnpm test:acceptance
pnpm smoke               # ou pnpm demo:smoke
```

## 3. Incidents courants

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| `pnpm smoke` exit 77 | Postgres ou Redis down | `docker compose up -d` ; vérifier `pg_isready` / `redis-cli ping` |
| API ne démarre pas | Redis injoignable (BullMQ) | Démarrer Redis ; `REDIS_URL` dans `.env` |
| Mission `BLOCKED` / `NO_APPROVAL_ROUTE` | Pas de routage A | Admin : import stub (démo) ou config métier réelle |
| `REJECT` Policy Guard | Owner / période / token / scope | Consulter `audit` + motif `gate.code` |
| Export PDF 404 | Job non terminé | Attendre `REPORT_AVAILABLE` ; vérifier `JobRun` |
| Chaîne audit `ok: false` | Tampering ou seed ancien | Re-seed en démo ; en réel : investiguer dump / logs |
| Support peut « Approuver » grisé | Normal | Seul rôle `approver` |
| Approver ne peut pas créer un ticket SAV | Normal | SAV = `support`/`ops`/`admin` ; ≠ approbation |
| Finding sans statut remédiation | Colonnes absentes / seed ancien | `pnpm db:migrate` puis re-seed démo |
| `OFFLINE_HOSTED` à l’exécution | `ATLAS_OFFLINE=true` en mode hébergé | Repasser online ou mode hybrid/local + jeton |
| Révocation `remoteConfirmed: false` | Offline attendu | `POST /v1/deploy/sync` une fois online |
| `POLICY_DENY` / maintenance | Flag ops `maintenanceMode` | Admin ops : lever maintenance (`/v1/admin/ops/maintenance`) |

### Kill / cancel d’urgence

```bash
# Annulation coopérative
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/v1/missions/$MISSION_ID/cancel

# Kill forcé
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/v1/missions/$MISSION_ID/kill
```

### Rotation secret JWT (dev)

1. Changer `JWT_SECRET` dans `.env`  
2. Redémarrer l’API  
3. Forcer re-login de tous les clients (tokens invalidés)

## 4. Ce qui n’est pas couvert

- PRA multi-région, chiffrement at-rest managé, alerting OTel production  
- Sauvegarde continue PITR Postgres managée  
- Export/effacement personne concernée bout-en-bout — voir hypothèses `docs/retention-et-purge.md` (pas une certification)  
- AIPD / base légale validée avocat — hors MVP  

### Rétention / legal hold (ops)

```bash
# Politique TTL (staff)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/v1/admin/retention/policy

# Activer un hold (bloque toute purge)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"active":true,"reason":"Litige FICTIF"}' \
  http://localhost:3001/v1/admin/retention/tenants/$TENANT_ID/legal-hold

# Dry-run purge (défaut)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"dryRun":true}' \
  http://localhost:3001/v1/admin/retention/tenants/$TENANT_ID/purge
```

