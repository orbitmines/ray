#!/usr/bin/env bash
set -euo pipefail
if command -v troll >/dev/null 2>&1; then
  exec troll "$@"
else
  TROLL_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/troll"
  exec sml "$TROLL_DIR/troll.sml" "$@"
fi
