#!/usr/bin/env bash
set -euo pipefail
if python3 -c "import fractran" 2>/dev/null; then
  exec python3 -m fractran "$1"
else
  exec python3 "${ETHER_EXTERNAL_DIR:-/tmp}/fractran/fractran.py" "$1"
fi
