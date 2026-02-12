#!/usr/bin/env bash
set -euo pipefail
command -v pvs >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/SRI-CSL/PVS"
  [[ -x "$REPO_DIR/pvs" ]]
}
