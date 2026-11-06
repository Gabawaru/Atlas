#!/usr/bin/env bash
# Fail if monorepo seed or live atlas-secu.com CTA is not Paradise download.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXPECT='https://cultivationparadise.com/api/atlas/download'
rg -F "$EXPECT" "$ROOT/index.html"
if rg -F 'github.com/Gabawaru/Atlas/releases' "$ROOT/index.html"; then
  echo "ERROR: monorepo index.html still points at private Releases" >&2
  exit 1
fi
curl -fsSL -o /tmp/atlas-secu.html https://atlas-secu.com/
if ! rg -F "$EXPECT" /tmp/atlas-secu.html; then
  echo "ERROR: live atlas-secu.com CTA drift — copy $ROOT/index.html → Gabawaru/atlas-secu-pages" >&2
  rg -o 'href="[^"]+"' /tmp/atlas-secu.html >&2 || true
  exit 1
fi
echo "ok — Pages CTA → Paradise"
