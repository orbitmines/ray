#!/usr/bin/env bash
set -euo pipefail
command -v wasmtime >/dev/null 2>&1 || command -v wasm-interp >/dev/null 2>&1
