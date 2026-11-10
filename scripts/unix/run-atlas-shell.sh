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

echo "Atlas Scan shell → http://127.0.0.1:17865/"
echo "API expected at   → http://127.0.0.1:3001/v1/health"
exec "$BIN"
