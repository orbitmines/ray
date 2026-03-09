#!/usr/bin/env bash
set -euo pipefail
command -v vau >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/breckinloggins/vau"
  [[ -x "$REPO_DIR/vau" ]]
}
