# Guide administrateur (entreprise A) — Atlas MVP

Console admin distincte du client. Auth locale seedée — **pas d’OIDC / SSO** dans ce MVP.

## Accès

- URL : `http://localhost:3000` (`apps/admin`)
- Mot de passe seed : `atlas-demo`

| Compte | Rôle | Peut approuver ? |
|--------|------|------------------|
| `approver@a.atlas.local` | approver | Oui |
| `admin@a.atlas.local` | admin | Non (mais importe le stub routage) |
| `support@a.atlas.local` | support | Non |
| `billing@a.atlas.local` | billing | Non |
| `ops@a.atlas.local` | ops | Non (peut vérifier l’audit) |

## Abonnement ≠ autorisation de test

Écran **« Abonnement ≠ autorisation de test »** (`GET /v1/admin/entitlements`) :

- montre par tenant : statut d’**abonnement** (droit logiciel) vs missions (RoE, co-signature 2 parties, jeton) ;
- une licence **active** n’implique **jamais** seule le droit d’exécuter ;
- l’indice « exécutable » reste soumis au Policy Guard à l’exécution.

## File d’approbation

1. Connexion avec un compte staff.
2. Liste des demandes `pending` ou `blocked_no_route`.
3. Seul le rôle **approver** peut Approuver / Rejeter.
4. L’approbation A **ne crée pas** l’autorisation propriétaire ni ne remplace le RoE signé.

## Débloquer le routage en démo (stub)

Sans politique de routage, les missions **réelles** restent `BLOCKED` (`NO_APPROVAL_ROUTE`).

1. Se connecter en **admin**.
2. Choisir un **tenant** (ex. `acme-sans-route`).
3. Cliquer **Importer stub hiérarchie pour ce tenant**.
4. Le groupe est marqué `isStub` — **ce n’est pas** l’organigramme réel A.
5. Les demandes `blocked_no_route` et missions bloquées pour ce motif passent en file `pending` / `A_APPROVAL_PENDING`.

## Vérifier le journal d’audit

- Bouton **Vérifier chaîne audit** (admin / ops) → `GET /v1/admin/audit/verify`
- `verify_chain` recalcule les hash ; une modification SQL du payload **casse** la chaîne.

## Limites admin MVP

- Pas de facturation PSP réelle, pas de SAV tickets, pas de catalogue connecteurs production.
- Pas de hiérarchie RH réelle — uniquement config stub / seed.
- Cross-tenant support : non abouti (pas d’impersonation journalisée complète).
