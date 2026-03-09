#!/usr/bin/env bash
set -euo pipefail
command -v orca >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/hundredrabbits/Orca"
  [[ -d "$REPO_DIR" ]]
}
