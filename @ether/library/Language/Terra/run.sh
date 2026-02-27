#!/usr/bin/env bash
set -euo pipefail
if command -v terra >/dev/null 2>&1; then
  exec terra "$@"
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/terralang/terra"
  exec "$REPO_DIR/build/bin/terra" "$@"
fi
