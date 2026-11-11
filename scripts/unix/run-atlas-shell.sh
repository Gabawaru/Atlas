#!/usr/bin/env bash
# Run the Atlas Scan shell on http://127.0.0.1:17865/ (Linux / macOS / WSL).
# Builds the native Go binary on demand. Windows users can keep using Atlas.exe.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BIN="$ROOT/remote-work/atlas-v1/bin/atlas"
LOCAL="$ROOT/remote-work/offline-installer/bin/AtlasLocal"

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

# Homebrew node@20 is keg-only — same class as install-atlas-prereqs.sh (#74).
# GUI PATH often omits /opt/homebrew/bin; resolve brew via well-known locations.
BREW_BIN=""
if command -v brew >/dev/null 2>&1; then
  BREW_BIN="$(command -v brew)"
elif [[ -x /opt/homebrew/bin/brew ]]; then
  BREW_BIN=/opt/homebrew/bin/brew
elif [[ -x /usr/local/bin/brew ]]; then
  BREW_BIN=/usr/local/bin/brew
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
  for keg in /opt/homebrew/opt/node@20/bin /opt/homebrew/opt/node/bin /usr/local/opt/node@20/bin /usr/local/opt/node/bin; do
    if [[ -d "$keg" ]]; then
      case ":$PATH:" in
        *":$keg:"*) ;;
        *) PATH="$keg:$PATH"; export PATH ;;
      esac
    fi
  done
fi

echo "Atlas Scan shell → http://127.0.0.1:17865/"
echo "API expected at   → http://127.0.0.1:3001/v1/health"
exec "$BIN"
