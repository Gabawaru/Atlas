# Client desktop Atlas — stub Tauri 2

Le **client web** (`apps/client`, Vite) est le parcours MVP supporté.  
Ce dossier ancre le shell **Tauri 2** sans présenter un binaire packagé comme terminé.

## État

| Élément | Statut |
|---------|--------|
| UI web React (build Vite) | ✅ `pnpm --filter @atlas/client run build` |
| Smoke packaging web | ✅ `pnpm client:smoke` |
| Stub Rust (`atlas-client-stub`) | ✅ `cargo run` — message uniquement |
| `tauri.conf.json` (cible) | ✅ présent, `bundle.active: false` |
| `tauri build` / binaire signé | ❌ reporté (webkit2gtk / signing) |

## Pourquoi pas `tauri build` ici ?

Sur les runners CI / agents cloud, **webkit2gtk** et la chaîne de packaging OS manquent souvent.  
Le stub Rust compile **sans** dépendance `tauri` pour rester vérifiable (`cargo check` / `cargo run`).

## Brancher Tauri 2 (hors CI minimale)

1. Installer toolchain desktop (voir [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)).
2. Remplacer le crate stub par une app Tauri 2 ; garder `frontendDist: ../dist`.
3. Ne **jamais** exécuter de contrôles dans le process UI — uniquement appels API `/v1`.
4. Secrets : plugins coffre OS — pas de secret en clair.

## macOS (plateforme stage)

1. Prérequis Node 20 + pnpm ; API locale optionnelle (`pnpm demo:smoke` puis `pnpm dev:api`).
2. UI web (chemin supporté) : `pnpm dev:client` → http://localhost:3002 (Safari / Chrome).
3. Vérifier le packaging : `pnpm --filter @atlas/client run build` puis `pnpm client:smoke`.
4. Stub desktop (message-only, pas de `.dmg`) : `cd apps/client/src-tauri && cargo run`.
5. CTA **Scanner** visible dès l’ouverture ; exécution uniquement via API + Policy Guard.

## Commandes

```bash
# Build web (livrable packaging MVP)
pnpm --filter @atlas/client run build

# Smoke : dist/index.html + assets
pnpm client:smoke

# Stub Rust (pas de UI native)
cd apps/client/src-tauri && cargo run
```
