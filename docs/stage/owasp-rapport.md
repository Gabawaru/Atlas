# Livrable rapport scanner / OWASP (axe 4)

Axe annexe Dataperl : scanner de vulnérabilités + **scoring OWASP Top 10** + **rapport visuel** + branchement CI/CD.

## Ce que Atlas livre aujourd’hui

| Brique | Emplacement / note |
|--------|--------------------|
| Policy Guard (décision déterministe, hors LLM) | `packages/policy-guard` |
| Contrôle passif borné (présence web DNS/HTTP/TLS) | `docs/controle-web-passif.md` |
| Exports rapport JSON / CSV / PDF | Runtime API + exemples [`docs/exemples/`](../exemples/) (`pnpm docs:exemple-rapport`) |
| CTA Scanner (client) | App client — exécution derrière autorisation + Policy Guard |
| Feeds vulns passifs | `docs/referentiels-vulnerabilites.md` |

Les exemples versionnés sont **FICTIFS** (`synthetic: true`).

## Scoring Top 10 + rapport « visuel »

- Une **revue code / inventaire OWASP Top 10** peut exister hors dépôt (store projet) ; le **produit** n’expose pas encore un scoring Top 10 figé + dashboard dédié comme livrable unique.
- Cible stage : faire converger exports existants + critères scanner vers un rapport lisible décideur (visuel) mappé Top 10 — sans inventer de score marketing tant que la métrique n’est pas figée avec le tuteur.

## CI/CD

Branchement CI du scanner « agressif » : **non** — MVP = passif + Policy Guard. La cible sécurité pipeline est documentée sous [`make-secure.md`](./make-secure.md) (SAST / secrets / deps), distincte des scans sur actifs clients.

## Garde-fous

Scans agressifs / exploitation : interdits sans **autorisation écrite** — [`docs/modele-autorisation-pentest.md`](../modele-autorisation-pentest.md). Aucune donnée client réelle dans les rapports d’exemple.
