#!/usr/bin/env bash
# Smoke packaging client web — pas de scan, pas d'API requise.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Build @atlas/client"
pnpm --filter @atlas/client run build

DIST="$ROOT/apps/client/dist"
test -f "$DIST/index.html" || { echo "FAIL: dist/index.html manquant"; exit 1; }

# Vite émet assets/index-*.js et éventuellement CSS
JS_COUNT=$(find "$DIST" -type f \( -name '*.js' -o -name '*.mjs' \) | wc -l | tr -d ' ')
if [[ "$JS_COUNT" -lt 1 ]]; then
  echo "FAIL: aucun bundle JS dans dist/"
  exit 1
fi

# Marqueur anti « faux desktop terminé »
if grep -qi 'tauri build success' "$DIST/index.html" 2>/dev/null; then
  echo "FAIL: marqueur desktop inattendu"
  exit 1
fi

echo "OK client smoke — dist/index.html + ${JS_COUNT} fichier(s) JS"
echo "Desktop : stub Rust uniquement (cd apps/client/src-tauri && cargo run) — pas de tauri build CI"
exit 0
