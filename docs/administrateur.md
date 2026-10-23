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
| `billing@a.atlas.local` | billing | Non (licences commerciales seulement) |
| `ops@a.atlas.local` | ops | Non (audit + **versions / maintenance**) |

## Versions / maintenance

Écran **« Versions / mises à jour / maintenance »** (`/v1/admin/ops/…`) — rôles `ops` / `admin` (lecture `support`) :

- catalogue versions + notes de release ;
- **flag maintenance** : si ON, aucune nouvelle exécution (Policy Guard `POLICY_DENY`) ;
- journal ops (maintenance, versions, notes) ;
- détail : `docs/versions-et-maintenance.md`.

## Licences & abonnements (stub)

Écran **« Licences & abonnements (stub) »** (`/v1/admin/billing/…`) — rôles `billing` / `admin` (lecture `ops`) :

- plans seed (`atlas-starter-fictif`, `atlas-pro-fictif`), activation / expiration ;
- paiement **stub** uniquement (pas de PSP réel) ;
- le rôle billing **ne voit pas** RoE, jetons ni findings (données commerciales seulement) ;
- détail : `docs/licences-abonnements.md`.

## Abonnement ≠ autorisation de test

Écran **« Abonnement ≠ autorisation de test »** (`GET /v1/admin/entitlements`) — rôles sécu (`admin` / `ops` / `support` / `approver`, **pas billing**) :

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

## SAV / tickets / incidents

Écran **« SAV / tickets / incidents »** (`/v1/admin/tickets`) :

- création et états `open` → `waiting` → `resolved` / `closed` ;
- lien **tenant** obligatoire, **mission** optionnelle ;
- rôles **support** / **ops** / **admin** peuvent muter ; **approver** peut lire seulement ;
- un ticket SAV **n’approuve jamais** une mission et ne remplace pas le Policy Guard ;
- seed : ticket FICTIF lié à la mission démo (`support@a.atlas.local`).

## Limites admin MVP

- Facturation = stub paiement (pas de PSP réel) ; pas de catalogue connecteurs production.
- SAV minimal (pas de SLA, pas d’escalade RH, pas d’impersonation journalisée complète).
- Pas de hiérarchie RH réelle — uniquement config stub / seed.
