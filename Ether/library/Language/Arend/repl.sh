#!/usr/bin/env bash
set -euo pipefail
INSTALL_DIR="${ETHER_EXTERNAL_DIR:-$HOME/.local/share}/arend"
exec java -jar "$INSTALL_DIR/Arend.jar" --repl
