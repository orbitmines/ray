#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/gitlab.com/korovin/iprover"
if command -v iprover >/dev/null 2>&1; then
  exec iprover "$1"
else
  exec "$REPO_DIR/iproveropt" "$1"
fi
