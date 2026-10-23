# Modes de déploiement — Atlas MVP

Aligné ADR-009 (architecture). **Mêmes contrats API** ; ce qui change : *où* tournent contrôle plane et worker, et le comportement **offline**.

## Modes

| Mode | Contrôle plane | Worker d’exécution | Offline |
|------|----------------|--------------------|---------|
| **hosted** (défaut) | Cloud A | Cloud A | Pas d’exécution si offline |
| **hybrid** | Cloud A (identité, abonnements, approbations) | On-prem / VPC client | Exécution seulement avec **jeton local** pré-matériel valide |
| **local** | Appliance / VM client | Même hôte / LAN | Idem jetons locaux ; sync optionnelle vers A |

Config :

```bash
ATLAS_DEPLOY_MODE=hosted   # hosted | hybrid | local
ATLAS_OFFLINE=false        # true = partition réseau simulée / air-gap
```

API : `GET /v1/deploy/mode` (matrice + runtime), `GET /v1/deploy/sync/pending`, `POST /v1/deploy/sync`.

## Conséquences offline (enforceables)

1. **Pas de fausse révocation distante instantanée**  
   Une révocation offline met l’intention en `SyncJournalEntry` (`pending`) et renvoie `remoteConfirmed: false`. La confirmation distante n’existe qu’après `POST /v1/deploy/sync` **online**.

2. **Exécution**  
   - `hosted` + offline → refus `OFFLINE_HOSTED`  
   - `hybrid`/`local` + offline sans jeton local → `OFFLINE_NO_TOKEN`  
   - avec jeton local valide → exécution bornée (Policy Guard inchangé)

3. **Sync journaux au retour**  
   `POST /v1/deploy/sync` refuse si encore offline (`STILL_OFFLINE`) ; sinon drain `pending` → `synced`.

## Ce qui n’est pas couvert

- Hiérarchie A réelle, OIDC, e-sign eIDAS  
- Agent worker multi-processus distinct du MVP in-process  
- PRA multi-région  

Voir aussi `docs/sauvegarde-maj-incidents.md`, `docs/tauri-stub.md` (client local).
