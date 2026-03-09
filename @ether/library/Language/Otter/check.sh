#!/usr/bin/env bash
set -euo pipefail
command -v otter >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/theoremprover-museum/otter"
  [[ -d "$REPO_DIR" ]]
}
