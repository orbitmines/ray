#!/usr/bin/env bash
set -euo pipefail
INSTALL_DIR="${ETHER_EXTERNAL_DIR:-$HOME/.local/share}/alloy"
[[ -f "$INSTALL_DIR/alloy.jar" ]] || command -v alloy &>/dev/null
