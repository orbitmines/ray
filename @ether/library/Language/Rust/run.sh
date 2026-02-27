#!/usr/bin/env bash
set -euo pipefail
file="$1"
if [[ -d "$file" ]]; then
  cd "$file" && cargo run
else
  rustc "$file" -o /tmp/rust_out && /tmp/rust_out
fi
