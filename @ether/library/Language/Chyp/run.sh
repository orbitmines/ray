#!/usr/bin/env bash
set -euo pipefail
if command -v chyp >/dev/null 2>&1; then
  exec chyp "$1"
else
  exec python3 -m chyp "$1"
fi
