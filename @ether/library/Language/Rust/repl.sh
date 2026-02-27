#!/usr/bin/env bash
set -euo pipefail
if command -v evcxr >/dev/null 2>&1; then
  exec evcxr "$@"
else
  echo "No Rust REPL found."
  echo "Install evcxr: cargo install evcxr_repl"
  exit 1
fi
