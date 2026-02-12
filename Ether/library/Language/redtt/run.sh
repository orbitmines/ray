#!/usr/bin/env bash
set -euo pipefail
if command -v redtt >/dev/null 2>&1; then
  exec redtt "$1"
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/RedPRL/redtt"
  exec "$REPO_DIR/_build/default/src/bin/main.exe" "$1"
fi
