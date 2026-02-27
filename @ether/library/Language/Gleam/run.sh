#!/usr/bin/env bash
set -euo pipefail
file="$1"
if [[ -d "$file" ]]; then
  cd "$file" && gleam run
else
  dir=$(mktemp -d)
  cd "$dir" && gleam new tmp_project --name main >/dev/null 2>&1
  cp "$file" "$dir/tmp_project/src/main.gleam"
  cd "$dir/tmp_project" && gleam run
  rm -rf "$dir"
fi
