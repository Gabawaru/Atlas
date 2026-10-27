#!/usr/bin/env bash
# Nuclei — informational / misconfig / tech-detect style templates only.
# Do NOT add custom exploit payloads here. Authz: ATLAS_AUTHZ=signed
set -euo pipefail

: "${TARGET_URL:?Set TARGET_URL (e.g. https://lab.example.invalid)}"
: "${OUT_DIR:=./raw}"
mkdir -p "${OUT_DIR}"

# Severity capped to info,low,medium for default defensive pass.
# Escalate tags/severity only when RoE explicitly allows.
echo "[nuclei] scan ${TARGET_URL} (info,low,medium — no custom exploits)"
nuclei -u "${TARGET_URL}" \
  -severity info,low,medium \
  -o "${OUT_DIR}/nuclei.txt" \
  -jsonl-export "${OUT_DIR}/nuclei.jsonl" \
  || true

echo "[nuclei] done → ${OUT_DIR}"
echo "[nuclei] tip: update templates on authorized workstation only: nuclei -update-templates"
