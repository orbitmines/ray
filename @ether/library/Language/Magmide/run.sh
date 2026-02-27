#!/usr/bin/env bash
set -euo pipefail
if command -v magmide >/dev/null 2>&1; then
  exec magmide "$1"
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/magmide/magmide"
  exec "$REPO_DIR/target/release/magmide" "$1"
fi
