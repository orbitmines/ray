#!/usr/bin/env bash
set -euo pipefail
if command -v wren_cli >/dev/null 2>&1; then
  exec wren_cli "$1"
elif command -v wren >/dev/null 2>&1; then
  exec wren "$1"
else
  echo "No Wren interpreter found." >&2; exit 1
fi
