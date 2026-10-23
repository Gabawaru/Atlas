# Licences, abonnements et droits commerciaux — Atlas MVP

Document **FR** : catalogue commercial, activation / expiration, rôle billing, stub paiement.  
**Hypothèses produit** — pas un avis juridique ni une certification.

## Glossaire (ne pas confondre)

| Terme | Signifie | N’autorise pas |
|-------|----------|----------------|
| **Plan** | Offre catalogue (`atlas-starter-fictif`, `atlas-pro-fictif`) : modules, plafonds LLM | Exécuter un contrôle |
| **Subscription** | Lien tenant ↔ plan (`trialing` / `active` / `past_due` / `canceled` + `endsAt`) | Pentest / scan |
| **Entitlement produit** | Modules inclus dans le plan | RoE, owner auth, jeton |
| **OwnerAuthorization / RoE / Token / Approval A** | Preuves d’autorisation de test | — |

**Règle dure :** un abonnement actif ouvre le **logiciel**. Il n’autorise **jamais** seul un contrôle. L’exécution passe par le Policy Guard (`SUBSCRIPTION_INACTIVE` si licence inactive ; sinon encore owner auth, scope, jeton, etc.).

## Activation / expiration

API staff (`billing` | `admin`) :

| Méthode | Chemin | Effet |
|---------|--------|--------|
| `GET` | `/v1/admin/billing/principle` | Principe + disclaimer stub |
| `GET` | `/v1/admin/billing/plans` | Catalogue |
| `GET` | `/v1/admin/billing/tenants` | id / slug / name seulement |
| `GET` | `/v1/admin/billing/subscriptions` | Vue **commerciale** (pas de RoE / jetons / findings) |
| `POST` | `/v1/admin/billing/subscriptions/activate` | Active (annule les licences actives du tenant) |
| `POST` | `/v1/admin/billing/subscriptions/:id/expire` | `canceled` + `endsAt=now` |
| `POST` | `/v1/admin/billing/subscriptions/:id/payment-stub` | Enregistre un paiement **stub** |

Helper partagé : `isSubscriptionCommerciallyActive(sub, now)` — `active`/`trialing` et `endsAt` non dépassé. Utilisé au lancement mission, matrice entitlements, plafonds assistant.

## Rôle billing

- **Peut** : lire plans / abonnements commerciaux, activer, expirer, enregistrer un paiement stub.
- **Ne peut pas** : approuver (AC-09), muter SAV, lire la matrice sécu `GET /v1/admin/entitlements` (RoE, co-signature, jetons), accéder findings / preuves.
- Compte seed : `billing@a.atlas.local` / `atlas-demo`.

## Stub paiement (pas de PSP)

- Modèle `PaymentStub` : `provider` toujours `"stub"`.
- Statuts : `stub_recorded` | `simulated_success` | `simulated_failure`.
- **Aucun** appel Stripe / Adyen / autre. Un paiement simulé ne crée **jamais** d’autorisation pentest (hors chemin Policy Guard).
- Évolution : PSP réel hors chemin d’autorisation (voir `docs/limites-et-evolution.md`).

## Seed FICTIF

| Entité | Détail |
|--------|--------|
| Plans | `atlas-starter-fictif`, `atlas-pro-fictif` |
| `demo-synth` | Abonnement starter **actif** |
| `acme-sans-route` | Abonnement pro **actif** (test BLOCKED routage) |
| `licence-expiree` | `status=active` mais `endsAt` passé → commercialement **inactif** |

## UI admin

Panneau **« Licences & abonnements (stub) »** (`apps/admin`) : liste plans, activer / expirer, stub paiement. Bannière explicite : licence ≠ droit d’exécuter. La matrice pédagogique « Abonnement ≠ autorisation de test » reste pour les rôles sécu (pas billing).

## Tests

- `packages/shared` : `isSubscriptionCommerciallyActive`
- `billing.rbac.test.ts` : billing ≠ entitlements sécu ; mutate réservé billing/admin
- `billing.lifecycle.test.ts` : expire → `SUBSCRIPTION_INACTIVE` ; abonnement seul → REJECT
- AC-04 inchangé : abonnement actif ≠ exécution

## Hors périmètre

OIDC, e-sign eIDAS, hiérarchie A réelle, PSP de production.
