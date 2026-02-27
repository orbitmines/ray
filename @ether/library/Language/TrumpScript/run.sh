#!/usr/bin/env bash
set -euo pipefail
if command -v TrumpScript >/dev/null 2>&1; then
  exec TrumpScript "$@"
else
  exec python3 -m TrumpScript "$@"
fi
