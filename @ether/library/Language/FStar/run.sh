#!/usr/bin/env bash
set -euo pipefail
if command -v fstar.exe >/dev/null 2>&1; then
  exec fstar.exe "$1"
elif command -v fstar >/dev/null 2>&1; then
  exec fstar "$1"
elif [[ -x /opt/fstar/bin/fstar.exe ]]; then
  exec /opt/fstar/bin/fstar.exe "$1"
else
  echo "F* not found." >&2; exit 1
fi
