#!/usr/bin/env bash
# Build Atlas.exe (Windows) + Atlas-Setup.exe (NSIS) for Paradise download chain.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "==> Go Atlas.exe (windows/amd64, GUI)"
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build \
  -ldflags="-s -w -H windowsgui" \
  -o "$ROOT/payload/Atlas.exe" .

echo "==> NSIS Atlas-Setup.exe"
mkdir -p "$ROOT/dist"
makensis "$ROOT/installer/Atlas.nsi"

# Paradise / GitHub Release ship name lives under offline-installer/bin
SHIP="$ROOT/../offline-installer/bin"
mkdir -p "$SHIP"
cp -f "$ROOT/dist/Atlas-Setup.exe" "$SHIP/Atlas-Setup.exe"

echo "==> Artifacts"
ls -la "$ROOT/payload/Atlas.exe" "$ROOT/dist/Atlas-Setup.exe" "$SHIP/Atlas-Setup.exe"
file "$ROOT/payload/Atlas.exe" "$ROOT/dist/Atlas-Setup.exe"
python3 - <<'PY'
from pathlib import Path
import hashlib
for p in [
    Path("dist/Atlas-Setup.exe"),
    Path("../offline-installer/bin/Atlas-Setup.exe"),
]:
    data = p.read_bytes()
    assert data[:2] == b"MZ", p
    print(f"{p}: size={len(data)} sha256={hashlib.sha256(data).hexdigest()}")
PY
