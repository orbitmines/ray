#!/usr/bin/env bash
set -euo pipefail
if command -v wolframscript >/dev/null 2>&1; then
  exec wolframscript
elif command -v wolfram >/dev/null 2>&1; then
  exec wolfram
else
  exec math
fi
