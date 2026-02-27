#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/igorto/chicken-js"
if [[ -f "$REPO_DIR/chicken.js" ]] && command -v node >/dev/null 2>&1; then
  exec node "$REPO_DIR/chicken.js" "$1"
elif [[ -f "$REPO_DIR/chicken.py" ]]; then
  exec python3 "$REPO_DIR/chicken.py" "$1"
else
  echo "Chicken interpreter not found." >&2; exit 1
fi
