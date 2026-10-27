# D1 — Cahier des charges (périmètre Atlas stage)

Document **canonique** stage pour le livrable pédagogique D1 (formalisation cahier des charges). Les specs détaillées restent dans les guides `docs/` ; ce fichier fixe le **périmètre** et les pointeurs.

| Champ | Valeur |
|-------|--------|
| Stagiaire | Gabriel Carbunaru — BTS CIEL option A, CNED |
| Organisme | DataPerl SASU |
| Période | 28/09/2026 → 20/11/2026 |
| Produit nommé convention | **Pragma Serve** (plateforme) |
| Livrable logiciel stage (ce repo) | **Atlas** — outil interne sécu / scanner |

## Objectif

Fournir un assistant de **pentest autorisé** utilisable par non-spécialistes, avec Policy Guard déterministe, contrôles **passifs** bornés, et exports de rapport — au service des missions stage **3–5** (et support doc **1** / **7**).

## In scope Atlas

1. Pipeline / cible **`make secure`** (SAST, secrets, deps) — [`make-secure.md`](./make-secure.md).
2. Scanner / présence web passive + exports ; trajectoire rapport OWASP — [`owasp-rapport.md`](./owasp-rapport.md).
3. Durcissement documenté (authz, RLS, secrets de démo, dette listée dans limites).
4. Documentation FR exploitable + mapping stage — [`STAGE.md`](../../STAGE.md).

## Hors scope (explicite)

| Sujet | Motif |
|-------|--------|
| Plateforme publique Pragma Serve (E2E produit) | Axe 1 — observation / tests hors repo |
| Projets clients | Axe 2 |
| Rôle partenaire de service | Axe 6 |
| Scans agressifs / exploits sans authz écrite | Règle produit + Art. sécurité convention |
| Données clients réelles dans le dépôt | Confidentialité Art. 3 |

## Références techniques (ne pas dupliquer ici)

- Principes non négociables : [`README.md`](../../README.md)
- Limites MVP : [`docs/limites-et-evolution.md`](../limites-et-evolution.md)
- Autorisation : [`docs/modele-autorisation-pentest.md`](../modele-autorisation-pentest.md)
- Critères scanner (réponses stage) : store projet `criteres-scanner-stage.md` (hors repo si non versionné)

## Critères d’acceptation pédagogiques (résumé)

- [ ] README / STAGE.md lient Atlas aux axes 3–5 et clarifient ≠ Pragma Serve.
- [ ] Cible `make secure` nommée et documentée (même si outils encore TBD).
- [ ] Chemin rapport / exports décrit ; exemples FICTIFS uniquement.
- [ ] Clause confidentialité visible pour contributeurs.
- [ ] D1 pointe vers un seul fichier canonique (celui-ci).
