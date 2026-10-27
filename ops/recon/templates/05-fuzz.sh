#!/usr/bin/env bash
# Web path fuzzing with ffuf — discovery only, placeholder URL + wordlist.
# Requires: ffuf + a local WORDLIST. Authz: ATLAS_AUTHZ=signed
set -euo pipefail

: "${TARGET_URL:?Set TARGET_URL base (e.g. https://lab.example.invalid)}"
: "${WORDLIST:?Set WORDLIST to a local wordlist path (not bundled)}"
: "${OUT_DIR:=./raw}"
mkdir -p "${OUT_DIR}"

# Ensure trailing path pattern for FUZZ
BASE="${TARGET_URL%/}"

echo "[fuzz] ffuf directory discovery → ${BASE}/FUZZ"
ffuf -u "${BASE}/FUZZ" \
  -w "${WORDLIST}" \
  -mc 200,204,301,302,307,401,403 \
  -t 40 \
  -o "${OUT_DIR}/ffuf.json" -of json \
  || true

echo "[fuzz] done → ${OUT_DIR}"
