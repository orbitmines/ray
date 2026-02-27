#!/usr/bin/env bash
set -euo pipefail
INSTALL_DIR="${ETHER_EXTERNAL_DIR:-$HOME/.local/share}/alloy"
if [[ -f "$INSTALL_DIR/alloy.jar" ]]; then
  exec java -jar "$INSTALL_DIR/alloy.jar" "$1"
else
  exec alloy "$1"
fi
