#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/hylo-lang/hylo"
if command -v hc >/dev/null 2>&1; then
  exec hc "$1"
else
  exec "$REPO_DIR/.build/release/hc" "$1"
fi
