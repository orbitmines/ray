#!/usr/bin/env bash
set -euo pipefail
if command -v fm >/dev/null 2>&1; then
  exec fm "$1"
elif command -v formality >/dev/null 2>&1; then
  exec formality "$1"
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/moonad/Formality"
  exec node "$REPO_DIR/bin/fm.js" "$1"
fi
