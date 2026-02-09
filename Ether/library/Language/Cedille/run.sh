#!/usr/bin/env bash
set -euo pipefail
if command -v cedille >/dev/null 2>&1; then
  exec cedille "$1"
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/cedille/cedille"
  cd "$REPO_DIR"
  stack exec cedille -- "$1"
fi
