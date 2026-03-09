#!/usr/bin/env bash
set -euo pipefail
FILE="$1"
if [[ "$FILE" == *.wat ]]; then
  # Convert WAT to WASM first
  wat2wasm "$FILE" -o /tmp/wasm_out.wasm
  exec wasmtime /tmp/wasm_out.wasm
else
  exec wasmtime "$FILE"
fi
