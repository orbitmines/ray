#!/usr/bin/env bash
set -euo pipefail
if command -v orca >/dev/null 2>&1; then
  exec orca "$@"
fi
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/hundredrabbits/Orca"
cd "$REPO_DIR"
exec npm start -- "$@"
