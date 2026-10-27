#!/usr/bin/env bash
# Port discovery — high-level nmap only (no exploit scripts / NSE exploit categories).
# Requires: nmap. Authz: ATLAS_AUTHZ=signed
set -euo pipefail

: "${TARGET_HOST:?Set TARGET_HOST (hostname or IP in scope, e.g. lab.example.invalid)}"
: "${OUT_DIR:=./raw}"
mkdir -p "${OUT_DIR}"

# Fast top ports then optional fuller TCP connect scan — discovery only.
echo "[ports] top-1000 TCP connect scan → ${TARGET_HOST}"
nmap -Pn -sT --top-ports 1000 -oA "${OUT_DIR}/nmap-top1000" "${TARGET_HOST}"

# Uncomment only when RoE allows broader TCP coverage:
# nmap -Pn -sT -p- -oA "${OUT_DIR}/nmap-alltcp" "${TARGET_HOST}"

# Service version (still discovery; avoid --script vuln / exploit categories here)
echo "[ports] service detection on open ports from top scan"
nmap -Pn -sT -sV --top-ports 1000 -oA "${OUT_DIR}/nmap-sv" "${TARGET_HOST}"

echo "[ports] done → ${OUT_DIR}"
