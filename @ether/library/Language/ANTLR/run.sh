#!/usr/bin/env bash
set -euo pipefail
if command -v antlr4 &>/dev/null; then
  exec antlr4 "$1"
elif command -v antlr &>/dev/null; then
  exec antlr "$1"
else
  INSTALL_DIR="${ETHER_EXTERNAL_DIR:-$HOME/.local/share}/antlr"
  exec java -jar "$INSTALL_DIR/antlr.jar" "$1"
fi
