#!/usr/bin/env bash
set -euo pipefail
if command -v hq9plus >/dev/null 2>&1; then
  exec hq9plus "$1"
else
  exec "$HOME/.local/bin/hq9plus" "$1"
fi
