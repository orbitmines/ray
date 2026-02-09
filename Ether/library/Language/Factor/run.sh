#!/usr/bin/env bash
set -euo pipefail
if command -v factor-lang >/dev/null 2>&1; then
  exec factor-lang -run="$1"
elif [[ -x /opt/factor/factor ]]; then
  exec /opt/factor/factor -run="$1"
else
  echo "Factor not found." >&2; exit 1
fi
