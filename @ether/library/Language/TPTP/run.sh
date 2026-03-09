#!/usr/bin/env bash
set -euo pipefail
if command -v eprover >/dev/null 2>&1; then
  exec eprover --auto "$@"
else
  cat "$@"
fi
