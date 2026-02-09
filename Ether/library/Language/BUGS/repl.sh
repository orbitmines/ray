#!/usr/bin/env bash
set -euo pipefail
if command -v julia >/dev/null 2>&1; then
  exec julia -e "using JuliaBUGS"
else
  echo "BUGS does not provide a standalone REPL. Use Julia or R." >&2
  exit 1
fi
