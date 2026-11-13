# Guide utilisateur (client) — Atlas MVP

Parcours **court** Inscription→rapport. Données **FICTIF**. Limites : `docs/limites-et-evolution.md`.

## Install

```bash
docker compose up -d && cp -n .env.example .env && pnpm install && pnpm demo:smoke
pnpm dev:client   # http://localhost:3002
```

Temps : voir `docs/demo-smoke.md`. Compte : `owner@demo.atlas.local` / `atlas-demo`.

## Parcours démo (3 étapes)

1. **Scanner** — CTA dominant dès l’ouverture ; disabled + motif si session / cible / connecteur pas prêts
2. **Connexion** (seed) — besoin fixe « présence web » (seul exécutable en démo)
3. **Scanner** → Policy Guard → **résultats unifiés** (services + findings + remédiation, pas de silo)

Options (RoE, connecteurs, actifs) sont repliées.

macOS stage : voir `apps/client/src-tauri/README.md` § « macOS (plateforme stage) ».

## Historique (local-first)

Une seule table de suivi des findings actionnables, dans le client :

- Stockage navigateur : clé `localStorage` **`atlas.vuln-tracking.v1`** — pas d’envoi automatique.
- **Seul egress payant** : bouton **Demander une prise en charge** (abonnement support Pragma ; pas de metering par domaine).
- Chaque ligne a un **ID court** (CCV) ; après prise en charge, un tampon **Prise en charge** + horodatage apparaît sous le statut.
- **Effacer le stockage local du site = effacer l’Historique** (pas de sync multi-appareil tant qu’aucune session support n’a été créée).

## Interdits (honnêtes)

Abonnement ≠ pentest · pas de scan hors scope · pas d’OIDC/e-sign/hiérarchie RH.  
Passifs : `docs/controle-web-passif.md`. Exemple : `docs/exemples/`.
