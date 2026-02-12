#!/usr/bin/env bash
set -euo pipefail
command -v redtt >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/RedPRL/redtt"
  [[ -x "$REPO_DIR/_build/default/src/bin/main.exe" ]]
}
