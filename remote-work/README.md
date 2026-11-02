# Atlas — pack remote-work (PC Windows perso)

Pack pour continuer Atlas **sans compte entreprise**, depuis un autre PC Windows.

**Repo :** https://github.com/Gabawaru/Atlas  
**Site :** https://atlas-secu.com  
**Releases :** https://github.com/Gabawaru/Atlas/releases/latest

## Contenu

| Chemin | Rôle |
|--------|------|
| `README.md` | Ce guide |
| `.env.example` | Template variables (placeholders vides pour les secrets) |
| `docs/atlas-gab-tuto-etapes.md` | Étapes Gab (clés / worker / CF / notify) |
| `docs/atlas-cf-routing-ben-checklist.md` | Checklist CF Email Routing (zone Ben) |
| `docs/atlas-product-loop.md` | Boucle produit Mail + clés (sans secrets) |
| `docs/resend-full-access-gab-roadmap.md` | Roadmap Resend full_access |
| `docs/atlas-secu-handoff.md` | Handoff founders (Pages, mail, Sign, RoE) |
| `docs/atlas-roe-perimeter.md` | Périmètre / Rules of Engagement |
| `bin/Atlas.exe` | Stub desktop Windows (message-only) |
| `bin/BUILD.md` | Comment le binaire a été produit |

## Télécharger l’exécutable

- **Dans le repo :** [`bin/Atlas.exe`](bin/Atlas.exe)
- **URL Release permanente :**  
  https://github.com/Gabawaru/Atlas/releases/latest/download/Atlas.exe

Double-clic → message d’accueil + liens. **Aucun scan** n’est lancé dans ce process.

## Continuer sur un autre Windows (checklist)

1. Clone ou zip du repo (ou au minimum ce dossier `remote-work/` + le monorepo si tu veux développer).
2. Copie `.env.example` → `.env` à la racine Atlas (ex. `C:\Users\gabri\Desktop\Dev\Atlas\.env`).
3. Colle les clés **uniquement** dans `.env` (jamais chat / Slack / commit) :
   - `PRAGMA_SIGN_API_KEY=`
   - `RESEND_API_KEY=`
4. Prérequis : Node ≥ 20, pnpm 9, Docker (Postgres + Redis).
5. `docker compose up -d` → `pnpm install` → `pnpm demo:smoke` (infra locale).
6. UIs : `pnpm dev:api` / `pnpm dev:client` / `pnpm dev:admin`.
7. Suivre `docs/atlas-gab-tuto-etapes.md` (worker Cursor, CF Ben, notify).

## Règles dures

- **Zéro secret dans git.** `.env` est gitignored.
- RoE : uniquement le périmètre documenté (`docs/atlas-roe-perimeter.md`) — hors scope = demander Ben/Romain.
- Stub `Atlas.exe` ≠ produit Tauri signé ; UI supportée = client web Vite.

## Liens utiles

- https://atlas-secu.com
- https://github.com/Gabawaru/Atlas
- https://github.com/Gabawaru/Atlas/releases/latest
- https://resend.com/api-keys (full_access quand tu voudras Done (a))
