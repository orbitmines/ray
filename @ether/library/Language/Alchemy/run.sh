#!/usr/bin/env bash
set -euo pipefail
if command -v alchemy &>/dev/null; then
  exec alchemy "$1"
else
  exec python3 "$1"
fi
