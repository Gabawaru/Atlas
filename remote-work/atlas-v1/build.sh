#!/usr/bin/env bash
# Build Atlas Scan shell for Windows (+ optional Linux/macOS binaries) and NSIS Setup.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
mkdir -p "$ROOT/payload" "$ROOT/dist" "$ROOT/bin"

echo "==> Go Atlas.exe (windows/amd64, GUI)"
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build \
  -ldflags="-s -w -H windowsgui" \
  -o "$ROOT/payload/Atlas.exe" .

HOST_OS="$(go env GOOS)"
HOST_ARCH="$(go env GOARCH)"
echo "==> Go atlas ($HOST_OS/$HOST_ARCH native)"
CGO_ENABLED=0 go build -ldflags="-s -w" -o "$ROOT/bin/atlas" .
cp -f "$ROOT/bin/atlas" "$ROOT/payload/atlas" 2>/dev/null || true

# Extra cross targets for multi-OS download / local use
for pair in "linux/amd64" "linux/arm64" "darwin/amd64" "darwin/arm64"; do
  os="${pair%/*}"
  arch="${pair#*/}"
  out="$ROOT/bin/atlas-${os}-${arch}"
  echo "==> Go $out"
  CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" go build -ldflags="-s -w" -o "$out" .
done

# Bundle existing AtlasLocal launcher (no Docker images — start only).
SHIP="$ROOT/../offline-installer/bin"
if [[ -f "$SHIP/AtlasLocal.exe" ]]; then
  cp -f "$SHIP/AtlasLocal.exe" "$ROOT/payload/AtlasLocal.exe"
else
  echo "WARN: missing $SHIP/AtlasLocal.exe — Windows payload incomplete" >&2
fi
if [[ -f "$SHIP/AtlasLocal" ]]; then
  cp -f "$SHIP/AtlasLocal" "$ROOT/payload/AtlasLocal"
  cp -f "$SHIP/AtlasLocal" "$ROOT/bin/AtlasLocal"
elif [[ -x "$SHIP/../launcher" ]] || [[ -d "$SHIP/../launcher" ]]; then
  echo "==> Build native AtlasLocal for payload"
  (cd "$ROOT/../offline-installer/launcher" && CGO_ENABLED=0 go build -ldflags="-s -w" -o "$SHIP/AtlasLocal" .)
  cp -f "$SHIP/AtlasLocal" "$ROOT/payload/AtlasLocal"
  cp -f "$SHIP/AtlasLocal" "$ROOT/bin/AtlasLocal"
fi

if command -v makensis >/dev/null 2>&1; then
  echo "==> NSIS Atlas-Setup.exe"
  makensis "$ROOT/installer/Atlas.nsi"
  mkdir -p "$SHIP"
  cp -f "$ROOT/dist/Atlas-Setup.exe" "$SHIP/Atlas-Setup.exe"
else
  echo "WARN: makensis missing — Atlas-Setup.exe skipped (shell binaries still built)"
fi

echo "==> Artifacts"
ls -la "$ROOT/bin"/atlas* "$ROOT/payload/Atlas.exe" 2>/dev/null || true
file "$ROOT/bin/atlas" "$ROOT/payload/Atlas.exe" 2>/dev/null || true
echo
echo "Native shell:  $ROOT/bin/atlas   → http://127.0.0.1:17865/"
echo "Windows PE:    $ROOT/payload/Atlas.exe"
