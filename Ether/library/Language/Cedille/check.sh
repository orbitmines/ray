#!/usr/bin/env bash
set -euo pipefail
command -v cedille >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/cedille/cedille"
  [[ -d "$REPO_DIR" ]]
}
