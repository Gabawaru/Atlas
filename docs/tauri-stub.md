# Client desktop Tauri — packaging MVP

## Livré maintenant

1. **Build web** : `pnpm --filter @atlas/client run build` → `apps/client/dist/`
2. **Smoke packaging** : `pnpm client:smoke` (vérifie `dist/index.html` + assets JS/CSS)
3. **Stub desktop** : `apps/client/src-tauri/` — `tauri.conf.json` cible + binaire Rust message-only (`cargo run`)
4. Doc honnête : pas de binaire Tauri signé / store tant que webkit + signing absents

## Limites

| Attendu | Réalité |
|---------|---------|
| Installateur `.dmg` / `.msi` / `.AppImage` | Non — `bundle.active: false` |
| Contrôles dans le process UI | **Interdit** — API + Policy Guard uniquement |
| Secrets locaux | Stub — pas de keychain branché |

## Parcours smoke e2e client (documenté)

```bash
# Prérequis : API optionnelle pour un parcours UI complet ; smoke packaging = build seul
pnpm --filter @atlas/shared build
pnpm --filter @atlas/client run build
pnpm client:smoke
```

Parcours manuel démo (avec API + seed) : ouvrir le client → CTA **Scanner** (disabled + motif si pas prêt) → résultats unifiés. Compte `owner@demo.atlas.local`. Voir `docs/utilisateur.md`.

**macOS :** UI web via `pnpm dev:client` ; stub `cargo run` dans `apps/client/src-tauri` (pas d’installateur `.dmg` tant que `bundle.active: false`). Détail : `apps/client/src-tauri/README.md`.

## Suite

Quand la machine a les prérequis Tauri 2 : activer le crate `tauri`, `bundle.active: true`, pointer `frontendDist` vers `../dist`.
