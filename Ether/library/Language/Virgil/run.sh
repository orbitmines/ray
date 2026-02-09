#!/usr/bin/env bash
set -euo pipefail
if command -v v3i >/dev/null 2>&1; then
  exec v3i "$1"
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/titzer/virgil"
  exec "$REPO_DIR/bin/v3i" "$1"
fi
