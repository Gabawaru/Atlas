# Stage DataPerl (CNED BTS CIEL) — Gabriel Carbunaru

Période : **28 sept. – 20 nov. 2026** (273 h, présentiel Antibes) · Tuteur entreprise : **Benjamin Mathias** (DataPerl SASU) · Encadrement complémentaire (annexe) : Romain Girardi.

Sources de vérité (hors dépôt) : convention signée DataPerl **28 sept. → 20 nov. 2026** + annexe entreprise Dataperl **10 sept. 2026** (7 axes missions). Synthèse projet : store `docs/stage-convention-findings.md`.

## Atlas ≠ Pragma Serve

| Nom | Rôle |
|-----|------|
| **Pragma Serve** | Plateforme métier publique (`pragma-serve.com`) — produit nommé dans la convention |
| **Atlas** (ce dépôt) | Outil **interne** de stage : vérification sécurité / scanner / Policy Guard (missions **3–5**, support **1** et **7**) |

Atlas n’est **pas** nommé dans la convention et **n’est pas** un substitut de Pragma Serve ni de la convention elle-même.

## Mapping des 7 axes (annexe Dataperl)

| # | Axe annexe | Couverture Atlas |
|---|------------|------------------|
| 1 | Tests E2E Pragma Serve | **Support / observation** — hors produit Atlas ; traces éventuelles via journal |
| 2 | Tests projets clients | **Hors repo** |
| 3 | Pipeline `make secure` (SAST, secrets, deps, CI) | **In scope** — cible documentée : [`docs/stage/make-secure.md`](docs/stage/make-secure.md) |
| 4 | Scanner vulnérabilités + scoring OWASP Top 10 + rapport visuel + CI | **In scope** — Policy Guard, contrôles passifs, exports : [`docs/stage/owasp-rapport.md`](docs/stage/owasp-rapport.md) |
| 5 | Durcissement / remédiation (auth, secrets, deps, dette sécu) | **In scope** — findings + docs limites ; boucle mesurable à renforcer |
| 6 | Rôle partenaire de service | **Hors repo** (observation) |
| 7 | Wiki + cartographie services / surfaces | **Support doc** — guides `docs/` ; wiki entreprise si fourni hors GitHub |

Annexe pédagogique convention (prise en main Pragma Serve, HTML/CSS/JS, Docker/Cloudflare, etc.) : **périmètre distinct** — ne pas fusionner avec le scope Atlas sans arbitrage tuteur.

## Confidentialité

Secret professionnel (**Art. 3** de la convention) : données clients, plateforme, secrets. Cadre = convention + engagement de confidentialité (PDF dédié **non localisé** au moment de la revue PC — à ajouter s’il existe).

Dans ce dépôt :

- Aucune **donnée client réelle**, secret, jeton ou preuve nominative dans issues, samples, seeds ou exports versionnés.
- Seeds / rapports d’exemple = **FICTIF** uniquement (`docs/exemples/`).
- Scans hors cible autorisée **interdits**. Activité agressive / exploitation : uniquement derrière autorisation écrite — [`docs/modele-autorisation-pentest.md`](docs/modele-autorisation-pentest.md).

## Cahier des charges (D1)

Canonique stage Atlas : [`docs/stage/d1-cahier-des-charges.md`](docs/stage/d1-cahier-des-charges.md).

## Livrables CNED (hors code)

| Livrable | Où / note |
|----------|-----------|
| Journal de bord quotidien | Template : [`docs/stage/journal-template.md`](docs/stage/journal-template.md) ; app de suivi entreprise si fournie |
| Comptes rendus / documentation | Guides `docs/` + PRs |
| Rapport de stage | Guide CNED Fiche 5 — joindre **convention + certificat** (fichiers locaux stagiaire, pas dans ce repo) |
| Certificat / attestation de fin de stage | Convention Art. 13 — durée effective + gratification ; hors dépôt |
| Rapport visuel scanner OWASP | Voir [`docs/stage/owasp-rapport.md`](docs/stage/owasp-rapport.md) |

Ne pas committer de PDF convention / certificat / données nominatives dans ce dépôt public.

## Liens docs Atlas utiles

- Principes & Policy Guard : [`README.md`](README.md)
- Limites MVP : [`docs/limites-et-evolution.md`](docs/limites-et-evolution.md)
- Autorisation écrite : [`docs/modele-autorisation-pentest.md`](docs/modele-autorisation-pentest.md)
- `make secure` : [`docs/stage/make-secure.md`](docs/stage/make-secure.md)
- Rapport OWASP : [`docs/stage/owasp-rapport.md`](docs/stage/owasp-rapport.md)
