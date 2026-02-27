#!/usr/bin/env bash
set -euo pipefail
file="$1"
if [[ -d "$file" ]]; then
  cd "$file" && zig build run
else
  zig run "$file"
fi
