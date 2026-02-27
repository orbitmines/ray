#!/usr/bin/env bash
set -euo pipefail
if command -v lobster >/dev/null 2>&1; then
  exec lobster "$1"
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/aardappel/lobster"
  exec "$REPO_DIR/dev/lobster" "$1"
fi
