#!/usr/bin/env bash
set -euo pipefail
FILE="$1"
BASENAME="$(basename "$FILE" .vhd)"
ghdl -a "$FILE" && ghdl -e "$BASENAME" && ghdl -r "$BASENAME"
