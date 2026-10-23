# Guide utilisateur (client) — Atlas MVP

Documentation **française** du parcours client tel qu’il fonctionne aujourd’hui.  
Données de démo marquées **FICTIF**. Ce n’est pas un avis juridique.

## Accès

- URL locale : `http://localhost:3002` (app `apps/client`)
- Compte seed : `owner@demo.atlas.local` / `atlas-demo`

Prérequis : API démarrée (`pnpm dev:api`) avec Postgres + Redis.

## Ce que vous pouvez faire

1. **Connexion** locale (pas d’OIDC réel).
2. **Conversation guidée** (LLM **mock**) sur les 5 besoins UX — l’IA propose, elle n’exécute rien.
3. **Cinq besoins** : seule la présence web est **utilisable** ; les autres affichent **non branché** ou **bientôt** (jamais « terminé » à tort).
4. **Connecteurs** : présence web (réel MVP) ; GitHub lecture seule = **stub mock OAuth** révocable, non production.
5. **Actifs** : domaine/URL (ex. `example.com`). Marqueur FICTIF possible.
6. **Mission démo** : besoin présence web uniquement → mission synthétique.
7. **Autorisation propriétaire** : signature via **SignatureProvider mock** (pas eIDAS).
8. **Exécution** : Policy Guard (connecteur actif requis) → DNS/HTTP dans le **périmètre** uniquement.
9. **Bilans** : décideur + détail technique ; exports JSON/CSV/PDF.

## Ce que vous ne pouvez pas faire (honnête)

| Attendu parfois | Réalité MVP |
|-----------------|-------------|
| Lancer un pentest parce que l’abonnement est actif | **Non** — abonnement ≠ autorisation |
| Scanner hors du scope approuvé | **Refusé** (Policy Guard / allowlist) |
| Réseau interne, CVE, connecteurs cloud | **Non branchés** (stubs UX) |
| App desktop Tauri | **Stub documenté** — client web seulement |
| Signature électronique légale | **Mock** uniquement |

## Messages fréquents

- *« Votre abonnement donne accès au produit… »* — licence logicielle, pas mandat de test.
- *`BLOCKED` / `NO_APPROVAL_ROUTE`* — mission **réelle** sans approbateur A configuré (voir guide admin).
- Bannière **Données de démonstration** — aucune cible réelle d’entreprise.

## Exemple de rapport

Voir `docs/exemples/rapport-presence-web-fictif.{json,csv,pdf}`.

## Rappels

- Annulation possible pendant l’exécution (`cancel`).
- Rate limit : contrôles passifs espacés.
- L’IA conversationnelle n’a **aucun** droit d’exécution.
