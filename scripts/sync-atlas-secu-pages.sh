#!/usr/bin/env bash
# Publish homepage + Atlas-Setup.exe to public Gabawaru/atlas-secu-pages (atlas-secu.com).
# Run as Gabawaru (or a token with push on that public repo). Does not touch secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INDEX="$ROOT/index.html"
CNAME_FILE="$ROOT/CNAME"
SETUP="$ROOT/remote-work/offline-installer/bin/Atlas-Setup.exe"
PAGES_REPO="${ATLAS_SECU_PAGES_REPO:-Gabawaru/atlas-secu-pages}"
BRANCH="${ATLAS_SECU_PAGES_BRANCH:-main}"

test -f "$INDEX" || { echo "Missing $INDEX"; exit 1; }
test -f "$CNAME_FILE" || { echo "Missing $CNAME_FILE"; exit 1; }
test -f "$SETUP" || { echo "Missing $SETUP — build offline-installer first"; exit 1; }

# MZ check (Windows PE)
python3 - <<PY
from pathlib import Path
p = Path("$SETUP")
data = p.read_bytes()
assert data[:2] == b"MZ", data[:2]
print(f"setup ok size={p.stat().st_size}")
PY

WORK="$(mktemp -d "${TMPDIR:-/tmp}/atlas-secu-pages-sync.XXXXXX")"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

git clone --depth 1 --branch "$BRANCH" "https://github.com/${PAGES_REPO}.git" "$WORK/repo"
cd "$WORK/repo"
cp "$INDEX" ./index.html
cp "$CNAME_FILE" ./CNAME
cp "$SETUP" ./Atlas-Setup.exe
git add index.html CNAME Atlas-Setup.exe
if git diff --cached --quiet; then
  echo "No changes to publish."
  exit 0
fi
git -c user.email="${GIT_AUTHOR_EMAIL:-ops@atlas-secu.com}" \
    -c user.name="${GIT_AUTHOR_NAME:-Atlas sync}" \
    commit -m "Sync homepage + Atlas-Setup.exe from Atlas monorepo"
git push origin "HEAD:${BRANCH}"
echo "Published. Expect: https://atlas-secu.com/Atlas-Setup.exe (Pages may lag 1–2 min)."
