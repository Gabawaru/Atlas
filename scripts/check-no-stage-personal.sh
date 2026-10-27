#!/usr/bin/env bash
# Fail if internship / stage-convention personal material reappears in the company repo.
# Musk-minimal: path + high-signal content greps only. Not a legal opinion.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FAIL=0

fail() {
  echo "FAIL: $*" >&2
  FAIL=1
}

# Tracked + untracked (non-ignored) so local reintroductions fail before push.
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  base="$(basename "$f")"
  if [[ "$base" == "STAGE.md" ]]; then
    fail "forbidden path $f (internship STAGE.md)"
  fi
  case "$f" in
    docs/stage|docs/stage/*)
      fail "forbidden path $f (docs/stage/ personal material)"
      ;;
  esac
  # Path names that look like convention / internship paperwork
  if echo "$f" | grep -qiE '(^|/)convention[^/]*stage|stage[^/]*convention|avancement-stage|internship'; then
    fail "forbidden path $f (convention/internship personal)"
  fi
done < <(git ls-files -co --exclude-standard)

# High-signal phrases from the removed README / STAGE.md mapping (exclude this script).
CONTENT_PATTERNS=(
  "Stage DataPerl"
  "Stage CNED"
  "Convention de stage"
  "Gabriel Carbunaru"
  "rapport de stage"
  "docs/stage/"
  "[STAGE.md]"
)

for pat in "${CONTENT_PATTERNS[@]}"; do
  # git grep exits 1 when no match — that is success for this gate
  if matches="$(git grep -n -F -- "$pat" -- \
      ':!scripts/check-no-stage-personal.sh' \
      ':!pnpm-lock.yaml' \
      2>/dev/null || true)" && [[ -n "$matches" ]]; then
    echo "$matches" >&2
    fail "forbidden content matching $(printf %q "$pat")"
  fi
done

if [[ "$FAIL" -ne 0 ]]; then
  echo "check-no-stage-personal: rejected — keep stage/internship paperwork out of Gabawaru/Atlas" >&2
  exit 1
fi

echo "OK check-no-stage-personal — no STAGE.md / docs/stage / convention personal markers"
exit 0
