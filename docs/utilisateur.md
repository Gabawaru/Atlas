# Guide utilisateur (client) — Atlas MVP

Parcours **court** Inscription→rapport. Données **FICTIF**. Limites : `docs/limites-et-evolution.md`.

## Install

```bash
docker compose up -d && cp -n .env.example .env && pnpm install && pnpm demo:smoke
pnpm dev:client   # http://localhost:3002
```

Temps : voir `docs/demo-smoke.md`. Compte : `owner@demo.atlas.local` / `atlas-demo`.

## Parcours démo (3 étapes)

1. **Scanner** — CTA dominant dès l’ouverture ; disabled + motif si session / cible / connecteur / besoin pas prêts
2. **Connexion** (seed) puis besoin — seule « présence web » est exécutable
3. **Scanner** → Policy Guard → **résultats unifiés** (services + findings, pas de silo)

Options (RoE, connecteurs, chat, remédiation) sont repliées — le chat **n’exécute jamais**.

macOS stage : `pnpm dev:client` ; stub Tauri message-only — `apps/client/src-tauri/README.md`.

## Interdits (honnêtes)

Abonnement ≠ pentest · pas de scan hors scope · pas d’OIDC/e-sign/hiérarchie RH.  
Passifs : `docs/controle-web-passif.md`. Exemple : `docs/exemples/`.
