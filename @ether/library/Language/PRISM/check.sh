#!/usr/bin/env bash
set -euo pipefail
command -v prism >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/prismplp/prism"
  [[ -d "$REPO_DIR" ]]
}
