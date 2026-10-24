# Guide utilisateur (client) — Atlas MVP

Parcours **court** Inscription→rapport. Données **FICTIF**. Limites : `docs/limites-et-evolution.md`.

## Install

```bash
docker compose up -d && cp -n .env.example .env && pnpm install && pnpm demo:smoke
pnpm dev:client   # http://localhost:3002
```

Temps : voir `docs/demo-smoke.md`. Compte : `owner@demo.atlas.local` / `atlas-demo`.

## Parcours démo (3 étapes)

1. **Connexion**
2. **Besoin** — seule « présence web » est exécutable ; les autres : état honnête (partiel / non branché)
3. **Lancer présence web** → Policy Guard → rapport

Options (RoE, connecteurs, chat, remédiation) sont repliées — le chat **n’exécute jamais**.

## Interdits (honnêtes)

Abonnement ≠ pentest · pas de scan hors scope · pas d’OIDC/e-sign/hiérarchie RH.  
Passifs : `docs/controle-web-passif.md`. Exemple : `docs/exemples/`.
