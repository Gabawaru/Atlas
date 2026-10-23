# Stub Tauri — client desktop Atlas

Le MVP de ce tour livre le **client web React** (`apps/client`) pour rester installable rapidement.

## Pourquoi un stub ?

Le shell **Tauri 2** (ADR-001) reste la cible multi-OS (Windows / macOS / Linux), mais l’embarquer complètement (toolchain Rust, icônes, signing) dépasse la tranche verticale minimale de ce tour.

## Prochaines étapes (hors ce PR)

1. `pnpm create tauri-app` dans `apps/client` ou initialiser `src-tauri/` avec Tauri 2.
2. Pointer `frontendDist` / `devUrl` vers le build Vite existant.
3. Ne **jamais** exécuter de contrôles dans le process UI — appels API / worker uniquement.
4. Plugins : coffre local / keychain pour secrets (pas de secret en clair).

## État actuel

| Élément | Statut |
|---------|--------|
| UI web React | ✅ MVP |
| Shell Tauri | ⏳ Stub documenté |
| Contrôles dans UI | ❌ Interdit |

Ce dossier existe pour ancrer l’intention desktop sans présenter un binaire Tauri comme « terminé ».
