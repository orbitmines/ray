#!/usr/bin/env bash
set -euo pipefail
if command -v dyna >/dev/null 2>&1; then
  exec dyna "$1"
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/nwf/dyna"
  exec python3 "$REPO_DIR/dyna/main.py" "$1"
fi
