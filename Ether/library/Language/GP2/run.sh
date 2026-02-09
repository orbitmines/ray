#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/UoYCS-plasma/GP2"
if command -v gp2 >/dev/null 2>&1; then
  exec gp2 "$1"
else
  exec "$REPO_DIR/bin/gp2" "$1"
fi
