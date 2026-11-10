#!/usr/bin/env bash
# Atlas prerequisite installer — Linux / macOS (and WSL).
# Mirrors scripts/windows/Install-AtlasPrereqs.ps1 for a coherent multi-OS path.
#
# Usage (from repo root):
#   bash scripts/unix/install-atlas-prereqs.sh
#   bash scripts/unix/install-atlas-prereqs.sh --skip-launch
#   bash scripts/unix/install-atlas-prereqs.sh --skip-install   # checklist only
#
# Does NOT start Cursor / agent workers.
set -euo pipefail

NODE_MAJOR_REQUIRED=20
PNPM_EXACT="9.15.0"
SKIP_INSTALL=0
SKIP_LAUNCH=0
LAUNCH_SCRIPT="dev"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install) SKIP_INSTALL=1; shift ;;
    --skip-launch) SKIP_LAUNCH=1; shift ;;
    --launch) LAUNCH_SCRIPT="${2:-dev}"; shift 2 ;;
    --repo-root) REPO_ROOT="$(cd "$2" && pwd)"; shift 2 ;;
    -h|--help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

pass() { printf '  [PASS] %s\n' "$*"; }
fail() { printf '  [FAIL] %s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }

OS="$(uname -s)"
ARCH="$(uname -m)"
echo "Atlas Unix prerequisite installer"
echo "OS: $OS/$ARCH"
echo "Repo: $REPO_ROOT"
echo "SkipInstall=$SKIP_INSTALL  SkipLaunch=$SKIP_LAUNCH  LaunchScript=$LAUNCH_SCRIPT"
echo "NOTE: Does not start Cursor/agent workers."

have() { command -v "$1" >/dev/null 2>&1; }

port_open() {
  local host="$1" port="$2"
  python3 - "$host" "$port" <<'PY' 2>/dev/null
import socket, sys
host, port = sys.argv[1], int(sys.argv[2])
s = socket.create_connection((host, port), 0.8)
s.close()
PY
}

ensure_node() {
  if have node; then
    major="$(node -v | sed -n 's/^v\([0-9]*\).*/\1/p')"
    if [[ "${major:-0}" -ge "$NODE_MAJOR_REQUIRED" ]]; then
      return 0
    fi
  fi
  info "Node >= $NODE_MAJOR_REQUIRED required."
  if [[ "$OS" == "Darwin" ]] && have brew; then
    brew install node@20 || brew install node
    return 0
  fi
  if have apt-get; then
    info "Install Node 20 via NodeSource or nvm, then re-run. (apt node may be older)"
    return 1
  fi
  return 1
}

ensure_pnpm() {
  if have corepack; then
    corepack enable >/dev/null 2>&1 || true
    corepack prepare "pnpm@${PNPM_EXACT}" --activate
  fi
  have pnpm
}

ensure_docker_or_native() {
  if have docker && docker info >/dev/null 2>&1; then
    (cd "$REPO_ROOT" && docker compose up -d)
    return 0
  fi
  if port_open 127.0.0.1 5432 && port_open 127.0.0.1 6379; then
    info "Docker unavailable — native Postgres:5432 + Redis:6379 detected."
    return 0
  fi
  info "Need Docker Engine/Desktop OR native Postgres 16 + Redis 7 on localhost."
  if [[ "$OS" == "Darwin" ]] && have brew; then
    info "Hint: brew install --cask docker   OR   brew install postgresql@16 redis"
  elif have apt-get; then
    info "Hint: sudo apt-get install -y docker.io docker-compose-v2"
    info "   or: sudo apt-get install -y postgresql redis-server  (+ create role/db atlas)"
  fi
  return 1
}

ensure_env_and_deps() {
  if [[ ! -f "$REPO_ROOT/.env" ]]; then
    cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
    info "Created .env from .env.example"
  fi
  # Local liability path without Pragma Sign envelope (documented in .env.example).
  if ! grep -qE '^ATLAS_AUTHZ=signed' "$REPO_ROOT/.env"; then
    printf '\nATLAS_AUTHZ=signed\n' >> "$REPO_ROOT/.env"
    info "Appended ATLAS_AUTHZ=signed for local/dev liability path"
  fi
  mkdir -p "$REPO_ROOT/apps/api"
  cp -f "$REPO_ROOT/.env" "$REPO_ROOT/apps/api/.env"
  (cd "$REPO_ROOT" && pnpm install)
  (cd "$REPO_ROOT" && pnpm --filter @atlas/shared build && pnpm --filter @atlas/policy-guard build)
  (cd "$REPO_ROOT" && pnpm db:generate || true)
}

if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  step "Install / verify Node"
  ensure_node || true
  step "Install / verify pnpm $PNPM_EXACT"
  ensure_pnpm || true
  step "Data plane (Docker compose or native Postgres/Redis)"
  ensure_docker_or_native || true
  step ".env + pnpm install + shared builds"
  if have pnpm; then
    ensure_env_and_deps || true
  else
    info "pnpm missing — skip deps"
  fi
else
  step "SkipInstall set — checklist only"
fi

step "Post-install checklist"
ALL_OK=1

NODE_OK=0
NODE_DETAIL="not found"
if have node; then
  NODE_DETAIL="$(node -v)"
  major="$(node -v | sed -n 's/^v\([0-9]*\).*/\1/p')"
  if [[ "${major:-0}" -ge "$NODE_MAJOR_REQUIRED" ]]; then NODE_OK=1; fi
fi
if [[ "$NODE_OK" -eq 1 ]]; then pass "Node.js >= $NODE_MAJOR_REQUIRED — $NODE_DETAIL"; else fail "Node.js >= $NODE_MAJOR_REQUIRED — $NODE_DETAIL"; ALL_OK=0; fi

PNPM_OK=0
PNPM_DETAIL="not found"
if have pnpm; then
  PNPM_DETAIL="$(pnpm -v)"
  if [[ "$PNPM_DETAIL" == "$PNPM_EXACT" || "$PNPM_DETAIL" == 9.* ]]; then PNPM_OK=1; fi
fi
if [[ "$PNPM_OK" -eq 1 ]]; then pass "pnpm $PNPM_EXACT — $PNPM_DETAIL"; else fail "pnpm $PNPM_EXACT — $PNPM_DETAIL"; ALL_OK=0; fi

DP_OK=0
DP_DETAIL="unreachable"
if have docker && docker info >/dev/null 2>&1; then
  DP_DETAIL="docker $(docker --version 2>/dev/null | head -1)"
  DP_OK=1
elif port_open 127.0.0.1 5432 && port_open 127.0.0.1 6379; then
  DP_DETAIL="native localhost:5432 + :6379"
  DP_OK=1
fi
if [[ "$DP_OK" -eq 1 ]]; then pass "Data plane — $DP_DETAIL"; else fail "Data plane — $DP_DETAIL"; ALL_OK=0; fi

if [[ -f "$REPO_ROOT/.env" ]]; then pass ".env present"; else fail ".env present — missing"; ALL_OK=0; fi
if [[ -d "$REPO_ROOT/node_modules" ]]; then pass "pnpm install (node_modules)"; else fail "pnpm install (node_modules) — missing"; ALL_OK=0; fi

echo
if [[ "$ALL_OK" -eq 1 ]]; then
  echo "Checklist: ALL PASS"
else
  echo "Checklist: SOME FAILURES — fix items above and re-run."
  echo "Linux tip: native Postgres/Redis is OK when Docker Engine is unavailable."
fi

if [[ "$ALL_OK" -eq 1 && "$SKIP_LAUNCH" -eq 0 ]]; then
  step "Launch Atlas UI (pnpm $LAUNCH_SCRIPT) — not an agent worker"
  info "API http://localhost:3001/v1/health | admin :3000 | client :3002 | shell :17865 (optional)"
  info "Press Ctrl+C to stop."
  cd "$REPO_ROOT"
  exec pnpm "$LAUNCH_SCRIPT"
elif [[ "$ALL_OK" -eq 1 && "$SKIP_LAUNCH" -eq 1 ]]; then
  info "SkipLaunch set — start later with: pnpm dev   or   pnpm atlas:shell"
fi

[[ "$ALL_OK" -eq 1 ]]
