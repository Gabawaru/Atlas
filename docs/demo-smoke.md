# demo:smoke — chemin accéléré (Musk étape 4)

Vérifie le parcours critique **sans** rejouer unit + acceptance (ceux-ci restent en CI).

## Prérequis (une fois)

```bash
docker compose up -d
cp -n .env.example .env
pnpm install
```

## Commande

```bash
pnpm demo:smoke
```

Enchaîne : build packages **si dist absent** → `pnpm smoke` (migrate + seed + e2e API).  
**Ne duplique plus** migrate/seed avant smoke.

| Variable | Défaut | Effet |
|----------|--------|--------|
| `ATLAS_FORCE_MOCK_NETWORK` | `true` | Passifs mockés (rapide/stable) |
| `ATLAS_FORCE_MOCK_NETWORK=false` | — | Preuves DNS/HTTP réelles sur `example.com` |

## Temps mesuré (agent Cursor, Postgres+Redis déjà up, dist déjà build, mock réseau)

| Étape | Mesure |
|-------|--------|
| Skip builds + skip prisma generate | &lt; 1 s |
| `pnpm smoke` (migrate + seed + e2e) | ~5 s |
| **Total `demo:smoke` chaud** | **~5 s** (mesuré, agent Cursor) |

Cold (premier build packages + generate) : typiquement ~30–60 s selon machine.  
Avant Musk étape 4 : migrate/seed **dupliqués** + builds systématiques + unit/AC dans l’ancien script → nettement plus long.

Exit **77** = Postgres ou Redis injoignable.

## Ce qui n’est pas dans demo:smoke

`pnpm test:unit` et `pnpm test:acceptance` — volontairement en CI seulement (ne pas rallonger le chemin démo).
