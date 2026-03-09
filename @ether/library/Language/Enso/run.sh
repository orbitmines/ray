#!/usr/bin/env bash
set -euo pipefail
if command -v enso >/dev/null 2>&1; then
  exec enso run "$1"
elif [[ -x /opt/enso/bin/enso ]]; then
  exec /opt/enso/bin/enso run "$1"
else
  echo "Enso not found." >&2; exit 1
fi
