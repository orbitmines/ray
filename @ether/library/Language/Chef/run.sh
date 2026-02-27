#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/joostrijneveld/Chef"
exec python3 "$REPO_DIR/chef.py" "$1"
