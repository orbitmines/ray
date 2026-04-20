#!/usr/bin/env bash
set -euo pipefail
if command -v vau >/dev/null 2>&1; then
  exec vau "$1"
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/breckinloggins/vau"
  exec "$REPO_DIR/vau" "$1"
fi
