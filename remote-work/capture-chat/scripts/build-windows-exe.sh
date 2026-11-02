#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/client-windows"
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o capture-chat.exe .
mkdir -p "$ROOT/bin"
cp -f capture-chat.exe "$ROOT/bin/capture-chat.exe"
file "$ROOT/bin/capture-chat.exe" || true
ls -la "$ROOT/bin/capture-chat.exe"
