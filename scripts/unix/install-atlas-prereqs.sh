#!/usr/bin/env bash
# Atlas prerequisite installer — Linux / macOS (and WSL).
# Mirrors scripts/windows/Install-AtlasPrereqs.ps1 for a coherent multi-OS path.
#
# Usage (from repo root):
#   bash scripts/unix/install-atlas-prereqs.sh
#   bash scripts/unix/install-atlas-prereqs.sh --skip-launch
#   bash scripts/unix/install-atlas-prereqs.sh --skip-install   # checklist only
#   bash scripts/unix/install-atlas-prereqs.sh --self-test      # Darwin PATH stubs (no Mac)
#
# Does NOT start Cursor / agent workers.
set -euo pipefail

NODE_MAJOR_REQUIRED=20
PNPM_EXACT="9.15.0"
SKIP_INSTALL=0
SKIP_LAUNCH=0
SELF_TEST=0
LAUNCH_SCRIPT="dev"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install) SKIP_INSTALL=1; shift ;;
    --skip-launch) SKIP_LAUNCH=1; shift ;;
    --self-test) SELF_TEST=1; shift ;;
    --launch) LAUNCH_SCRIPT="${2:-dev}"; shift 2 ;;
    --repo-root) REPO_ROOT="$(cd "$2" && pwd)"; shift 2 ;;
    -h|--help)
      sed -n '1,22p' "$0"
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

# Override in --self-test only (prod = real Homebrew keg layouts).
: "${ATLAS_INSTALL_KEG_CANDIDATES:=/opt/homebrew/opt/node@20/bin:/opt/homebrew/opt/node/bin:/usr/local/opt/node@20/bin:/usr/local/opt/node/bin}"

# Homebrew node@20 is keg-only — install can succeed while `node` stays off PATH
# (mirrors Windows Refresh-PathFromMachine after winget).
# When brew is missing entirely, fall through to well-known keg bins
# (parity with AtlasLocal brew_path.go / run-atlas-shell.sh).
prepend_brew_node_path() {
  local formula prefix keg
  if have brew; then
    for formula in node@20 node; do
      prefix="$(brew --prefix "$formula" 2>/dev/null || true)"
      if [[ -n "${prefix:-}" && -d "$prefix/bin" ]]; then
        case ":$PATH:" in
          *":$prefix/bin:"*) ;;
          *) PATH="$prefix/bin:$PATH"; export PATH ;;
        esac
      fi
    done
  else
    IFS=':' read -r -a _keg_cands <<< "$ATLAS_INSTALL_KEG_CANDIDATES"
    for keg in "${_keg_cands[@]}"; do
      if [[ -d "$keg" ]]; then
        case ":$PATH:" in
          *":$keg:"*) ;;
          *) PATH="$keg:$PATH"; export PATH ;;
        esac
      fi
    done
  fi
  hash -r 2>/dev/null || true
}

node_major_ok() {
  have node || return 1
  local major
  major="$(node -v 2>/dev/null | sed -n 's/^v\([0-9]*\).*/\1/p')"
  [[ "${major:-0}" -ge "$NODE_MAJOR_REQUIRED" ]]
}

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
  if node_major_ok; then
    return 0
  fi
  # Darwin: keg already installed but shell PATH never saw it
  # (brew on PATH, or keg-direct when brew binary is absent).
  if [[ "$OS" == "Darwin" ]]; then
    prepend_brew_node_path
    if node_major_ok; then
      return 0
    fi
  fi
  info "Node >= $NODE_MAJOR_REQUIRED required."
  if [[ "$OS" == "Darwin" ]] && have brew; then
    brew install node@20 || brew install node
    prepend_brew_node_path
    if node_major_ok; then
      return 0
    fi
    info "Node still missing after brew (keg-only?). Try: export PATH=\"\$(brew --prefix node@20)/bin:\$PATH\""
    return 1
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

# Linux-CIable proof of Darwin keg-only PATH wiring (no Mac / no real brew).
run_self_test() {
  local tmp keg bin saved_path saved_os bare
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  keg="$tmp/Cellar/node@20/20.11.0"
  bin="$keg/bin"
  bare="$tmp/bin:/usr/bin:/bin" # excludes host Node (/exec-daemon, nvm, …)
  mkdir -p "$bin" "$tmp/bin"
  cat >"$bin/node" <<'EOS'
#!/usr/bin/env bash
echo "v20.11.0"
EOS
  chmod +x "$bin/node"
  cat >"$tmp/bin/brew" <<EOS
#!/usr/bin/env bash
if [[ "\$1" == "--prefix" && "\$2" == "node@20" ]]; then
  echo "$keg"
  exit 0
fi
if [[ "\$1" == "--prefix" && "\$2" == "node" ]]; then
  exit 1
fi
if [[ "\$1" == "install" ]]; then
  exit 0
fi
exit 1
EOS
  chmod +x "$tmp/bin/brew"

  saved_path="$PATH"
  saved_os="$OS"
  OS="Darwin"
  PATH="$bare"
  export PATH OS
  hash -r 2>/dev/null || true

  step "self-test: prepend keg-only node@20"
  if node_major_ok; then
    fail "bare PATH must hide host node before prepend"
    return 1
  fi
  prepend_brew_node_path
  if ! node_major_ok; then
    fail "node_major_ok after prepend (expected v20 from keg)"
    return 1
  fi
  pass "node_major_ok after keg PATH prepend — $(node -v)"

  step "self-test: ensure_node recovers via brew --prefix"
  PATH="$bare"
  export PATH
  hash -r 2>/dev/null || true
  if ! ensure_node; then
    fail "ensure_node should succeed with stub brew + keg"
    return 1
  fi
  if ! node_major_ok; then
    fail "ensure_node returned 0 but node still bad"
    return 1
  fi
  pass "ensure_node recovers via brew --prefix — $(node -v)"

  step "self-test: fail-closed when brew useless"
  cat >"$tmp/bin/brew" <<'EOS'
#!/usr/bin/env bash
exit 1
EOS
  chmod +x "$tmp/bin/brew"
  PATH="$bare"
  export PATH
  hash -r 2>/dev/null || true
  # Point keg candidates at missing dirs so fail-closed is not masked by host Homebrew.
  ATLAS_INSTALL_KEG_CANDIDATES="$tmp/missing-keg-a:$tmp/missing-keg-b"
  export ATLAS_INSTALL_KEG_CANDIDATES
  if ensure_node; then
    fail "ensure_node must fail-closed without node and without brew prefix"
    return 1
  fi
  pass "ensure_node fail-closed when brew stub useless and no node"

  step "self-test: no brew → keg-direct fallback"
  mkdir -p "$tmp/emptybin" "$tmp/opt/node@20/bin"
  cp -f "$bin/node" "$tmp/opt/node@20/bin/node"
  chmod +x "$tmp/opt/node@20/bin/node"
  PATH="$tmp/emptybin:/usr/bin:/bin"
  export PATH
  hash -r 2>/dev/null || true
  ATLAS_INSTALL_KEG_CANDIDATES="$tmp/opt/node@20/bin"
  export ATLAS_INSTALL_KEG_CANDIDATES
  if have brew; then
    fail "brew must be absent for keg-direct case"
    return 1
  fi
  if node_major_ok; then
    fail "node must be absent before keg-direct"
    return 1
  fi
  prepend_brew_node_path
  if ! node_major_ok; then
    fail "keg-direct fallback must expose node"
    return 1
  fi
  pass "keg-direct prepend → $(node -v)"
  PATH="$tmp/emptybin:/usr/bin:/bin"
  export PATH
  hash -r 2>/dev/null || true
  if ! ensure_node; then
    fail "ensure_node must recover via keg-direct without brew"
    return 1
  fi
  pass "ensure_node recovers via keg-direct — $(node -v)"
  unset ATLAS_INSTALL_KEG_CANDIDATES

  OS="$saved_os"
  PATH="$saved_path"
  export PATH OS
  hash -r 2>/dev/null || true
  echo
  echo "Self-test: ALL PASS"
  return 0
}

if [[ "$SELF_TEST" -eq 1 ]]; then
  run_self_test
  exit $?
fi

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
