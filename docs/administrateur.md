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

## Ops / commercial (replié dans l’UI)

Hors chemin démo (file + routage). Détail : `docs/versions-et-maintenance.md`, `docs/licences-abonnements.md`.  
Matrice pédagogique abonnement ≠ autorisation : `GET /v1/admin/entitlements` (pas le rôle billing).

## File d’approbation

1. Connexion avec un compte staff.
2. Liste des demandes `pending` ou `blocked_no_route`.
3. Seul le rôle **approver** peut Approuver / Rejeter.
4. L’approbation A **ne crée pas** l’autorisation propriétaire ni ne remplace le RoE signé.

## Débloquer le routage (stub ou CSV prêt)

Sans politique de routage, les missions **réelles** restent `BLOCKED` (`NO_APPROVAL_ROUTE`).

1. Se connecter en **admin**.
2. Choisir un **tenant** (ex. `acme-sans-route`).
3. Soit **Importer stub** (démo), soit coller un **CSV** (`POST /v1/admin/routing/import`).
4. Fichier **vide** → aucune route — missions réelles restent BLOCKED ; **aucun** approbateur inventé.
5. Groupe marqué `isStub` — **pas** l’organigramme réel A. Voir `docs/import-hierarchie.md`.

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
