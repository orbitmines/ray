#!/usr/bin/env bash
set -euo pipefail
if command -v luau >/dev/null 2>&1; then
  exec luau "$1"
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/luau-lang/luau"
  exec "$REPO_DIR/build/luau" "$1"
fi
