#!/usr/bin/env bash
set -euo pipefail
if command -v icr >/dev/null 2>&1; then
  exec icr
else
  echo "Crystal does not include a built-in REPL. Install icr: https://github.com/crystal-community/icr" >&2
  exit 1
fi
