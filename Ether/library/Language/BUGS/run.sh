#!/usr/bin/env bash
set -euo pipefail
if command -v julia >/dev/null 2>&1; then
  exec julia -e "using JuliaBUGS; include(\"$1\")"
elif command -v Rscript >/dev/null 2>&1; then
  exec Rscript "$1"
else
  echo "No BUGS runtime found. Install Julia or R." >&2; exit 1
fi
