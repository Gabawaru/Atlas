#!/usr/bin/env bash
# One gate: secrets (gitleaks) + SAST (semgrep) + deps (pnpm audit).
# Fails on any secret, Semgrep ERROR, or critical dependency advisory.
set -euo pipefail
cd "$(dirname "$0")/.."

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "make-secure: missing '$1' on PATH" >&2
    exit 127
  }
}

need gitleaks
need semgrep
need pnpm

echo "==> secrets (gitleaks)"
gitleaks detect --source . --redact --exit-code 1

echo "==> sast (semgrep)"
# ERROR ~= critical bar for Semgrep (no CRITICAL severity in default packs).
semgrep scan --config p/ci --severity ERROR --error --metrics=off --quiet

echo "==> deps (pnpm audit --audit-level=critical)"
pnpm audit --audit-level=critical

echo "make-secure: ok"
