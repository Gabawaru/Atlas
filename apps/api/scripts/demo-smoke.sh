#!/usr/bin/env bash
# Atlas MVP — smoke démo documenté (Postgres + Redis requis)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "→ .env créé depuis .env.example"
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://atlas:atlas_dev_only@localhost:5432/atlas?schema=public}"
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
export JWT_SECRET="${JWT_SECRET:-dev-only-change-me-not-a-real-secret}"
export ATLAS_FORCE_MOCK_NETWORK="${ATLAS_FORCE_MOCK_NETWORK:-false}"

echo "== Atlas demo:smoke =="
echo "DATABASE_URL=$DATABASE_URL"
echo "REDIS_URL=$REDIS_URL"

pnpm --filter @atlas/shared build
pnpm --filter @atlas/policy-guard build
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm test:unit
pnpm test:acceptance
pnpm smoke

echo "== demo:smoke OK =="
