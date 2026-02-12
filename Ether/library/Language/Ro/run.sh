#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/chiragbharadwaj/ro"
exec "$REPO_DIR/ro" "$1"
