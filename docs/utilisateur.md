# Guide utilisateur (client) — Atlas MVP

Parcours **court** Inscription→rapport. Données **FICTIF**. Pas un avis juridique.

## Install rapide

```bash
docker compose up -d
cp -n .env.example .env
pnpm install
pnpm demo:smoke          # migrate + seed + smoke e2e
pnpm dev                 # api :3001 · admin :3000 · client :3002
```

Compte client : `owner@demo.atlas.local` / `atlas-demo`.

## Parcours démo (3 étapes)

1. **Connexion**
2. **Besoin** — seule « présence web » est exécutable ; les 4 autres affichent un état honnête (partiel / non branché), jamais un faux « terminé »
3. **Lancer présence web** → Policy Guard → rapport

Options avancées (RoE, connecteurs, chat) sont repliées — le chat **n’exécute jamais**.

## Ce que vous ne pouvez pas faire

| Attendu | Réalité |
|---------|---------|
| Pentest parce que l’abonnement est actif | Non — licence ≠ autorisation |
| Scan hors scope / agressif | Refusé |
| OIDC / e-sign légal / hiérarchie RH | Non (mock / format prêt seulement) |

Détail passifs : `docs/controle-web-passif.md`. Rapport d’exemple : `docs/exemples/`.
