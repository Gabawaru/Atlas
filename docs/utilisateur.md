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

## Interdits (honnêtes)

Abonnement ≠ pentest · pas de scan hors scope · pas d’OIDC/e-sign/hiérarchie RH.  
Passifs : `docs/controle-web-passif.md`. Exemple : `docs/exemples/`.
