# Versions, mises à jour et maintenance — Atlas MVP

Document **FR** : catalogue versions produit, notes de release, flag maintenance (kill-switch), journal ops.

## Principe

| Élément | Effet |
|---------|--------|
| **ProductVersion** | Catalogue + note de release ; une version `current` exposée sur `/v1/health` |
| **Maintenance ON** | `killSwitch=true` au Policy Guard → `POLICY_DENY` — **bloque toute nouvelle exécution** de mission |
| **Journal ops** | Événements humains (maintenance, versions, notes) — distinct de l’audit chaîné |

La maintenance **ne remplace pas** RoE / owner auth / abonnement. Elle coupe seulement l’exécution (ops).

## API (`ops` | `admin` ; lecture aussi `support`)

| Méthode | Chemin |
|---------|--------|
| `GET` | `/v1/admin/ops/status` |
| `GET` | `/v1/admin/ops/versions` |
| `POST` | `/v1/admin/ops/versions` — publier (ops/admin) |
| `POST` | `/v1/admin/ops/maintenance` — `{ active, reason? }` |
| `GET` | `/v1/admin/ops/journal` |
| `POST` | `/v1/admin/ops/journal/note` |

Compte seed : `ops@a.atlas.local` / `atlas-demo`.

## Procédure maj recommandée

1. Activer **maintenance** (UI admin ou API).  
2. Suivre `docs/sauvegarde-maj-incidents.md` (backup, migrate, tests).  
3. Publier une nouvelle version (note de release).  
4. Lever la maintenance.  
5. Vérifier `/v1/health` (`maintenanceMode: false`, `version` à jour).

## Hors périmètre

OIDC, e-sign eIDAS, hiérarchie A réelle, orchestration rolling update cloud UE.
