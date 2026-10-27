#!/usr/bin/env bash
# Subdomain enumeration + HTTP probe — PLACEHOLDER domain via env.
# Requires: subfinder, httpx (optional whatweb). Authz: ATLAS_AUTHZ=signed
set -euo pipefail

: "${TARGET_DOMAIN:?Set TARGET_DOMAIN (e.g. lab.example.invalid)}"
: "${OUT_DIR:=./raw}"
mkdir -p "${OUT_DIR}"

echo "[subs] subfinder → ${TARGET_DOMAIN}"
subfinder -d "${TARGET_DOMAIN}" -silent -o "${OUT_DIR}/subfinder.txt"

echo "[subs] httpx probe of discovered hosts"
if [[ -s "${OUT_DIR}/subfinder.txt" ]]; then
  httpx -l "${OUT_DIR}/subfinder.txt" -silent -status-code -title -tech-detect \
    -o "${OUT_DIR}/httpx.txt" || true
else
  echo "[subs] no subdomains found; probing apex only"
  printf '%s\n' "${TARGET_DOMAIN}" | httpx -silent -status-code -title -tech-detect \
    -o "${OUT_DIR}/httpx.txt" || true
fi

if command -v whatweb >/dev/null 2>&1 && [[ -s "${OUT_DIR}/httpx.txt" ]]; then
  echo "[subs] whatweb sample (first URL if present)"
  # httpx lines may include metadata; extract first token as URL-ish host
  first="$(awk 'NR==1 {print $1}' "${OUT_DIR}/httpx.txt")"
  if [[ -n "${first}" ]]; then
    whatweb --color=never "${first}" | tee "${OUT_DIR}/whatweb.txt" || true
  fi
fi

echo "[subs] done → ${OUT_DIR}"
