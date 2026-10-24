#!/usr/bin/env bash
# Atlas MVP — chemin démo accéléré (Musk étape 4).
# Unit + acceptance restent en CI (pnpm test:unit / test:acceptance).
# Prérequis : docker compose up -d (Postgres + Redis), pnpm install.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

START=$(date +%s)
step() { echo "→ $*"; }

if [[ ! -f .env ]]; then
  cp .env.example .env
  step ".env créé depuis .env.example"
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://atlas:atlas_dev_only@localhost:5432/atlas?schema=public&options=-c%20app.bypass_rls%3Don}"
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
export JWT_SECRET="${JWT_SECRET:-dev-only-change-me-not-a-real-secret}"
# Mock réseau par défaut = plus rapide / stable ; réel : ATLAS_FORCE_MOCK_NETWORK=false
export ATLAS_FORCE_MOCK_NETWORK="${ATLAS_FORCE_MOCK_NETWORK:-true}"

echo "== Atlas demo:smoke (accéléré) =="
echo "ATLAS_FORCE_MOCK_NETWORK=$ATLAS_FORCE_MOCK_NETWORK"

# Build packages seulement si dist absent (évite ~2–5s inutiles)
if [[ ! -f packages/shared/dist/index.js ]]; then
  step "build @atlas/shared"
  pnpm --filter @atlas/shared build
else
  step "skip build shared (dist présent)"
fi
if [[ ! -f packages/policy-guard/dist/index.js ]]; then
  step "build @atlas/policy-guard"
  pnpm --filter @atlas/policy-guard build
else
  step "skip build policy-guard (dist présent)"
fi

# Prisma client : générer seulement si absent (pnpm store path)
if compgen -G 'node_modules/.pnpm/@prisma+client@*/node_modules/@prisma/client/index.js' > /dev/null; then
  step "skip prisma generate (client présent)"
else
  step "prisma generate"
  pnpm db:generate
fi

# migrate + seed sont faits DANS smoke.ts — ne pas les dupliquer ici
step "smoke e2e (migrate + seed + parcours)"
pnpm smoke

END=$(date +%s)
ELAPSED=$((END - START))
echo "== demo:smoke OK en ${ELAPSED}s =="
echo "CI complète (séparée) : pnpm test:unit && pnpm test:acceptance"
