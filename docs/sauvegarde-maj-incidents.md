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

```bash
git fetch && git checkout cursor/mvp-scaffold-fc63   # ou main après merge
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
- Procédure RGPD complète (export/effacement) — modèle de rétention documenté ailleurs, non automatisé ici  
