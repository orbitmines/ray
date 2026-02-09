#!/usr/bin/env bash
set -euo pipefail
file="$1"
if [[ -d "$file" ]]; then
  cd "$file" && cabal run 2>/dev/null || stack run
else
  runghc "$file"
fi
