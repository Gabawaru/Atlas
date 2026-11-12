#!/usr/bin/env bash
# Atlas axe 4 — passive ZAP baseline against authorized *-dev.pragma-cloud.com only.
# RoE: GET-only requestor (no spider / ajax / active / mutations). No client-brand hosts by default.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SEC="$(cd "$(dirname "$0")" && pwd)"
HOSTS_FILE="${ATLAS_ZAP_HOSTS_FILE:-$SEC/dev-hosts.default.txt}"
OUT_DIR="${ATLAS_ZAP_OUT:-$ROOT/docs/security/reports}"
ZAP_HOME="${ATLAS_ZAP_HOME:-}"
STATIC_JSON="${ATLAS_ZAP_STATIC_JSON:-}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/atlas-zap-XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

DEV_RE='^[a-z0-9]([a-z0-9-]*[a-z0-9])?-dev\.pragma-cloud\.com$'

die() { echo "ERROR: $*" >&2; exit 1; }

load_hosts() {
  local f="$1" line h
  HOSTS=()
  [[ -f "$f" ]] || die "hosts file missing: $f"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="$(echo "$line" | tr -d '[:space:]')"
    [[ -z "$line" ]] && continue
    h="${line,,}"
    h="${h#https://}"
    h="${h%%/*}"
    [[ "$h" =~ $DEV_RE ]] || die "refused host « $h » — only *-dev.pragma-cloud.com (RoE axe4)"
    HOSTS+=("$h")
  done <"$f"
  ((${#HOSTS[@]} > 0)) || die "no hosts in $f"
}

resolve_zap() {
  if [[ -n "$ZAP_HOME" && -x "$ZAP_HOME/zap.sh" ]]; then
    ZAP_BIN="$ZAP_HOME/zap.sh"
    return
  fi
  if [[ -x /tmp/zap-dl/ZAP_2.17.0/zap.sh ]]; then
    ZAP_BIN=/tmp/zap-dl/ZAP_2.17.0/zap.sh
    return
  fi
  if command -v docker >/dev/null 2>&1; then
    ZAP_BIN=docker
    return
  fi
  die "ZAP not found. Set ATLAS_ZAP_HOME to a ZAP install (zap.sh) or install Docker (zaproxy/zap-stable)."
}

write_af() {
  local yaml="$1" out_json_base="$2" h
  {
    cat <<EOF
---
env:
  contexts:
    - name: atlas-axe4-dev-passive
      urls:
EOF
    for h in "${HOSTS[@]}"; do
      echo "        - https://$h"
    done
    cat <<EOF
  parameters:
    failOnError: true
    failOnWarning: false
    progressToStdout: true
jobs:
  - type: passiveScan-config
    parameters:
      maxAlertsPerRule: 20
      scanOnlyInScope: true
  - type: requestor
    parameters: {}
    requests:
EOF
    for h in "${HOSTS[@]}"; do
      cat <<EOF
      - url: https://$h/
        method: GET
EOF
    done
    cat <<EOF
  - type: passiveScan-wait
    parameters:
      maxDuration: 5
  - type: report
    parameters:
      template: traditional-json
      reportDir: $(dirname "$out_json_base")
      reportFile: $(basename "$out_json_base")
      reportTitle: Atlas axe4 passive ZAP baseline (dev-only)
EOF
  } >"$yaml"
}

run_zap() {
  local yaml="$1" json_base="$2"
  mkdir -p "$(dirname "$json_base")"
  if [[ "$ZAP_BIN" == "docker" ]]; then
    # Mount work dir; rewrite reportDir inside container
    local c_yaml="/zap/wrk/plan.yaml" c_out="/zap/wrk/out"
    mkdir -p "$WORK/out"
    sed "s|reportDir: .*|reportDir: $c_out|" "$yaml" >"$WORK/plan.yaml"
    docker run --rm -v "$WORK:/zap/wrk:rw" ghcr.io/zaproxy/zaproxy:stable \
      zap.sh -cmd -silent -autorun "$c_yaml"
    cp "$WORK/out/"*.json "${json_base}.json" 2>/dev/null \
      || cp "$WORK/out/$(basename "$json_base").json" "${json_base}.json"
  else
    "$ZAP_BIN" -cmd -silent -autorun "$yaml"
  fi
  [[ -f "${json_base}.json" ]] || die "ZAP did not write ${json_base}.json"
}

main() {
  load_hosts "$HOSTS_FILE"
  resolve_zap
  mkdir -p "$OUT_DIR"
  local base="$OUT_DIR/zap-baseline-dev-$STAMP"
  local yaml="$WORK/plan.yaml"
  write_af "$yaml" "$base"
  echo "Hosts (${#HOSTS[@]}): ${HOSTS[*]}"
  echo "ZAP: $ZAP_BIN"
  run_zap "$yaml" "$base"
  local report_args=(--zap-json "${base}.json" --out-dir "$OUT_DIR" --stamp "$STAMP")
  if [[ -n "$STATIC_JSON" ]]; then
    [[ -f "$STATIC_JSON" ]] || die "static JSON missing: $STATIC_JSON"
    report_args+=(--static-json "$STATIC_JSON")
  fi
  node "$SEC/zap-owasp-report.mjs" "${report_args[@]}"
  echo "OK — reports under $OUT_DIR (stamp $STAMP)"
}

main "$@"
