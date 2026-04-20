#!/usr/bin/env bash
set -euo pipefail
if command -v bitwuzla >/dev/null 2>&1; then
  exec bitwuzla "$1"
else
  exec python3 "$1"
fi
