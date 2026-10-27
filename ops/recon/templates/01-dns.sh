#!/usr/bin/env bash
# DNS / WHOIS recon — PLACEHOLDER targets only in docs; set env for real authorized engagement.
# Requires: dig, whois. Authz: ATLAS_AUTHZ=signed
set -euo pipefail

: "${TARGET_DOMAIN:?Set TARGET_DOMAIN (e.g. lab.example.invalid)}"
: "${OUT_DIR:=./raw}"
mkdir -p "${OUT_DIR}"

echo "[dns] dig NS/A/AAAA/MX/TXT for ${TARGET_DOMAIN}"
dig NS "${TARGET_DOMAIN}" +noall +answer | tee "${OUT_DIR}/dig-ns.txt"
dig A "${TARGET_DOMAIN}" +noall +answer | tee "${OUT_DIR}/dig-a.txt"
dig AAAA "${TARGET_DOMAIN}" +noall +answer | tee "${OUT_DIR}/dig-aaaa.txt"
dig MX "${TARGET_DOMAIN}" +noall +answer | tee "${OUT_DIR}/dig-mx.txt"
dig TXT "${TARGET_DOMAIN}" +noall +answer | tee "${OUT_DIR}/dig-txt.txt"
dig ANY "${TARGET_DOMAIN}" +noall +answer 2>/dev/null | tee "${OUT_DIR}/dig-any.txt" || true

echo "[dns] whois ${TARGET_DOMAIN}"
whois "${TARGET_DOMAIN}" | tee "${OUT_DIR}/whois.txt" || true

echo "[dns] done → ${OUT_DIR}"
