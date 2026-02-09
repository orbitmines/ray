#!/usr/bin/env bash
set -euo pipefail
INSTALL_DIR="${ETHER_EXTERNAL_DIR:-$HOME/.local/share}/arend"
[[ -f "$INSTALL_DIR/Arend.jar" ]] && command -v java &>/dev/null
