#!/usr/bin/env bash
set -euo pipefail
if command -v cling >/dev/null 2>&1; then
  exec cling "$@"
else
  echo "No C REPL found."
  echo "Install cling: https://github.com/root-project/cling"
  echo "Alternative: use 'tcc -run' for quick script execution."
  exit 1
fi
