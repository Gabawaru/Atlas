#!/usr/bin/env bash
# Copy current Atlas-Setup.exe into a Cultivation-Paradise checkout's bundled
# server-assets (paradise-gate fallback). Use when live download still serves
# the old 688793-byte PE and Vercel token/URL is not refreshed yet.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHIP="$ROOT/bin/Atlas-Setup.exe"
EXPECT_SHA="${EXPECT_SHA:-51696c9755e3cf062a881e64a4af49f6b9aa1d641e0a4e1758e81c7f939681e2}"
EXPECT_SIZE="${EXPECT_SIZE:-2089922}"

PARADISE="${1:-}"
if [[ -z "$PARADISE" || ! -d "$PARADISE" ]]; then
  echo "Usage: $0 /path/to/Cultivation-Paradise" >&2
  exit 2
fi

DEST="$PARADISE/src/server-assets/atlas-v1/Atlas-Setup.exe"
test -f "$SHIP"
SIZE=$(wc -c <"$SHIP" | tr -d ' ')
SHA=$(sha256sum "$SHIP" | awk '{print $1}')
if [[ "$SIZE" != "$EXPECT_SIZE" || "$SHA" != "$EXPECT_SHA" ]]; then
  echo "ERROR: ship PE mismatch (size=$SIZE sha=$SHA); rebuild atlas-v1 first" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEST")"
cp -f "$SHIP" "$DEST"
echo "Wrote $DEST"
echo "size=$SIZE sha256=$SHA"
echo "Next: commit + deploy Paradise; curl live /api/atlas/download must be size $EXPECT_SIZE"
