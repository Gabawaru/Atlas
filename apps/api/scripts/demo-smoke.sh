#!/usr/bin/env bash
# Atlas MVP — smoke démo court (Postgres + Redis requis)
# Méthode Musk : accélérer le chemin critique ; unit/acceptance restent en CI.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "→ .env créé depuis .env.example"
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://atlas:atlas_dev_only@localhost:5432/atlas?schema=public&options=-c%20app.bypass_rls%3Don}"
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
export JWT_SECRET="${JWT_SECRET:-dev-only-change-me-not-a-real-secret}"
export ATLAS_FORCE_MOCK_NETWORK="${ATLAS_FORCE_MOCK_NETWORK:-false}"

echo "== Atlas demo:smoke (court) =="
echo "1) docker compose up -d   # si Postgres/Redis absents"
echo "2) build shared + migrate + seed + smoke e2e"

pnpm --filter @atlas/shared build
pnpm --filter @atlas/policy-guard build
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm smoke

echo "== demo:smoke OK =="
echo "CI complète : pnpm test:unit && pnpm test:acceptance"
