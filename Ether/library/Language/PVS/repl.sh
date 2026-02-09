#!/usr/bin/env bash
set -euo pipefail
if command -v pvs >/dev/null 2>&1; then
  exec pvs
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/SRI-CSL/PVS"
  exec "$REPO_DIR/pvs"
fi
