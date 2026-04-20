#!/usr/bin/env bash
set -euo pipefail
if command -v column >/dev/null 2>&1; then
  exec column -s, -t "$1"
else
  exec cat "$1"
fi
