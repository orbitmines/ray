#!/usr/bin/env bash
set -euo pipefail
command -v v3c >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/titzer/virgil"
  [[ -x "$REPO_DIR/bin/v3c" ]]
}
