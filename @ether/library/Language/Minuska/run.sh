#!/usr/bin/env bash
set -euo pipefail
if command -v minuska >/dev/null 2>&1; then
  exec minuska "$1"
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/h0nzZik/minuska"
  cd "$REPO_DIR" && exec make run FILE="$1"
fi
