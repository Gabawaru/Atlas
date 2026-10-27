# Cible `make secure` (axe 3)

Objectif pédagogique / produit : un jalon unique (nommé **`make secure`**) qui enchaîne analyses **SAST**, détection de **secrets**, et revue des **dépendances** vulnérables, intégrable à la CI.

## État actuel (MVP)

| Élément | État |
|---------|------|
| Cible Makefile / script `make secure` | **TBD** — pas encore de `Makefile` ni de script homonyme dans le dépôt |
| CI GitHub Actions | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) : install, build packages, migrate/seed, `pnpm test:unit`, `pnpm test:acceptance` |
| SAST | **TBD** (outil retenu à figer avec le tuteur) |
| Secrets scanning | **TBD** |
| Deps vulns (`pnpm audit` / OSV / équivalent) | **TBD** côté pipeline nommé ; feeds vulns passifs produit : `docs/referentiels-vulnerabilites.md` |

## Sortie CI attendue (cible)

Quand la cible sera branchée :

1. Échec CI si secret évident ou critique deps au-delà du seuil décidé.
2. Artefact / log lisible (résumé SAST + secrets + deps) attaché au job.
3. Documentation de la commande locale : `make secure` (ou `pnpm secure` si Makefile refusé) = même suite que la CI.

## Hors scope de ce document

- Procédures d’exploitation / PoC.
- Scans sur des cibles non autorisées.

Voir aussi : [`STAGE.md`](../../STAGE.md) · [`owasp-rapport.md`](./owasp-rapport.md).
