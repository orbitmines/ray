#!/usr/bin/env bash
set -euo pipefail
if command -v linearml >/dev/null 2>&1; then
  exec linearml "$1"
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/pikatchu/LinearML"
  exec "$REPO_DIR/linearml" "$1"
fi
