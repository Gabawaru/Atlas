#!/usr/bin/env bash
# Run the Atlas Scan shell on http://127.0.0.1:17865/ (Linux / macOS / WSL).
# Builds the native Go binary on demand. Windows users can keep using Atlas.exe.
#
#   bash scripts/unix/run-atlas-shell.sh
#   bash scripts/unix/run-atlas-shell.sh --self-test   # Darwin PATH stubs (Linux CI OK)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BIN="$ROOT/remote-work/atlas-v1/bin/atlas"
LOCAL="$ROOT/remote-work/offline-installer/bin/AtlasLocal"

# Override in --self-test only (prod defaults = real Homebrew layouts).
: "${ATLAS_SHELL_BREW_CANDIDATES:=/opt/homebrew/bin/brew:/usr/local/bin/brew}"
: "${ATLAS_SHELL_KEG_CANDIDATES:=/opt/homebrew/opt/node@20/bin:/opt/homebrew/opt/node/bin:/usr/local/opt/node@20/bin:/usr/local/opt/node/bin}"

# Homebrew node@20 is keg-only — same class as install-atlas-prereqs.sh / AtlasLocal.
# GUI PATH often omits brew; resolve via well-known locations then keg dirs.
atlas_shell_prepend_brew_node_path() {
  local BREW_BIN="" cand formula prefix keg
  if command -v brew >/dev/null 2>&1; then
    BREW_BIN="$(command -v brew)"
  else
    IFS=':' read -r -a _brew_cands <<< "$ATLAS_SHELL_BREW_CANDIDATES"
    for cand in "${_brew_cands[@]}"; do
      if [[ -x "$cand" ]]; then
        BREW_BIN="$cand"
        break
      fi
    done
  fi
  if [[ -n "$BREW_BIN" ]]; then
    for formula in node@20 node; do
      prefix="$("$BREW_BIN" --prefix "$formula" 2>/dev/null || true)"
      if [[ -n "${prefix:-}" && -d "$prefix/bin" ]]; then
        case ":$PATH:" in
          *":$prefix/bin:"*) ;;
          *) PATH="$prefix/bin:$PATH"; export PATH ;;
        esac
      fi
    done
  else
    IFS=':' read -r -a _keg_cands <<< "$ATLAS_SHELL_KEG_CANDIDATES"
    for keg in "${_keg_cands[@]}"; do
      if [[ -d "$keg" ]]; then
        case ":$PATH:" in
          *":$keg:"*) ;;
          *) PATH="$keg:$PATH"; export PATH ;;
        esac
      fi
    done
  fi
}

run_self_test() {
  local tmp keg bin bare saved_path
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  keg="$tmp/Cellar/node@20/20.11.0"
  bin="$keg/bin"
  bare="$tmp/emptybin:/usr/bin:/bin"
  mkdir -p "$bin" "$tmp/emptybin" "$tmp/gui/bin" "$tmp/opt/node@20/bin"
  cat >"$bin/node" <<'EOS'
#!/usr/bin/env bash
echo "v20.11.0"
EOS
  chmod +x "$bin/node"
  cp -f "$bin/node" "$tmp/opt/node@20/bin/node"
  chmod +x "$tmp/opt/node@20/bin/node"

  cat >"$tmp/gui/bin/brew" <<EOS
#!/usr/bin/env bash
if [[ "\$1" == "--prefix" && "\$2" == "node@20" ]]; then
  echo "$keg"
  exit 0
fi
exit 1
EOS
  chmod +x "$tmp/gui/bin/brew"

  saved_path="$PATH"

  echo "==> self-test: brew on PATH"
  PATH="$tmp/gui/bin:$bare"
  export PATH
  hash -r 2>/dev/null || true
  if command -v node >/dev/null 2>&1; then
    echo "FAIL: bare PATH must hide host node" >&2
    return 1
  fi
  atlas_shell_prepend_brew_node_path
  if ! command -v node >/dev/null 2>&1; then
    echo "FAIL: brew on PATH must prepend keg" >&2
    return 1
  fi
  echo "PASS: brew on PATH → $(node -v)"

  echo "==> self-test: brew OFF PATH (GUI absolute)"
  PATH="$bare"
  export PATH
  hash -r 2>/dev/null || true
  ATLAS_SHELL_BREW_CANDIDATES="$tmp/gui/bin/brew"
  ATLAS_SHELL_KEG_CANDIDATES="$tmp/missing"
  export ATLAS_SHELL_BREW_CANDIDATES ATLAS_SHELL_KEG_CANDIDATES
  if command -v node >/dev/null 2>&1; then
    echo "FAIL: node must be absent before GUI brew resolve" >&2
    return 1
  fi
  atlas_shell_prepend_brew_node_path
  if ! command -v node >/dev/null 2>&1; then
    echo "FAIL: GUI absolute brew must prepend keg" >&2
    return 1
  fi
  echo "PASS: GUI absolute brew → $(node -v)"

  echo "==> self-test: no brew → keg-direct fallback"
  PATH="$bare"
  export PATH
  hash -r 2>/dev/null || true
  ATLAS_SHELL_BREW_CANDIDATES="$tmp/missing-brew"
  ATLAS_SHELL_KEG_CANDIDATES="$tmp/opt/node@20/bin"
  export ATLAS_SHELL_BREW_CANDIDATES ATLAS_SHELL_KEG_CANDIDATES
  if command -v node >/dev/null 2>&1; then
    echo "FAIL: node must be absent before keg-direct" >&2
    return 1
  fi
  atlas_shell_prepend_brew_node_path
  if ! command -v node >/dev/null 2>&1; then
    echo "FAIL: keg-direct fallback must expose node" >&2
    return 1
  fi
  echo "PASS: keg-direct → $(node -v)"

  PATH="$saved_path"
  export PATH
  unset ATLAS_SHELL_BREW_CANDIDATES ATLAS_SHELL_KEG_CANDIDATES
  hash -r 2>/dev/null || true
  echo
  echo "Self-test: ALL PASS"
  return 0
}

if [[ "${1:-}" == "--self-test" ]]; then
  run_self_test
  exit $?
fi

if [[ ! -x "$BIN" ]]; then
  echo "==> Building Atlas shell…"
  bash "$ROOT/remote-work/atlas-v1/build.sh"
fi
if [[ ! -x "$LOCAL" ]]; then
  echo "==> Building AtlasLocal…"
  (cd "$ROOT/remote-work/offline-installer/launcher" && CGO_ENABLED=0 go build -ldflags="-s -w" -o "$LOCAL" .)
  mkdir -p "$(dirname "$BIN")"
  cp -f "$LOCAL" "$(dirname "$BIN")/AtlasLocal" 2>/dev/null || true
  cp -f "$LOCAL" "$ROOT/remote-work/atlas-v1/payload/AtlasLocal" 2>/dev/null || true
fi

# Prefer AtlasLocal next to the shell binary for /start-api.
cp -f "$LOCAL" "$(dirname "$BIN")/AtlasLocal" 2>/dev/null || true

atlas_shell_prepend_brew_node_path

echo "Atlas Scan shell → http://127.0.0.1:17865/"
echo "API expected at   → http://127.0.0.1:3001/v1/health"
exec "$BIN"
