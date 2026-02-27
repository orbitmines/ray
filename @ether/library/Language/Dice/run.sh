#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/SHoltzen/dice"
if [[ -x "$REPO_DIR/dice" ]]; then
  exec "$REPO_DIR/dice" "$1"
else
  exec dice "$1"
fi
