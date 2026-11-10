#!/usr/bin/env bash
# Build Windows offline installer artifacts on Linux (Go cross + NSIS).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
BIN="$ROOT/bin"
mkdir -p "$BIN"

echo "==> Go AtlasLocal.exe (windows/amd64)"
(
  cd "$ROOT/launcher"
  CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o "$BIN/AtlasLocal.exe" .
)
echo "==> Go AtlasLocal (native $(go env GOOS)/$(go env GOARCH))"
(
  cd "$ROOT/launcher"
  CGO_ENABLED=0 go build -ldflags="-s -w" -o "$BIN/AtlasLocal" .
)
for pair in "linux/amd64" "linux/arm64" "darwin/amd64" "darwin/arm64"; do
  os="${pair%/*}"
  arch="${pair#*/}"
  echo "==> Go AtlasLocal-${os}-${arch}"
  (cd "$ROOT/launcher" && CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" go build -ldflags="-s -w" -o "$BIN/AtlasLocal-${os}-${arch}" .)
done

echo "==> Portable zip"
ZIP="$BIN/AtlasLocal-portable.zip"
rm -f "$ZIP"
(
  cd "$ROOT"
  zip -q -r "$ZIP" README.md scripts bin/AtlasLocal.exe nsis/AtlasLocal.nsi build.sh launcher/main.go launcher/go.mod
)

echo "==> NSIS Setup"
if command -v makensis >/dev/null 2>&1; then
  makensis -DOUTFILE="$BIN/AtlasLocal-Setup.exe" "$ROOT/nsis/AtlasLocal.nsi"
else
  echo "WARN: makensis missing — Setup.exe skipped (portable zip still built)"
fi

echo "==> Artifacts"
ls -la "$BIN"
file "$BIN"/AtlasLocal.exe "$BIN"/AtlasLocal-Setup.exe 2>/dev/null || true
echo
echo "Primary installer: $BIN/AtlasLocal-Setup.exe"
echo "Portable:          $BIN/AtlasLocal-portable.zip"
echo "Launcher only:     $BIN/AtlasLocal.exe"
