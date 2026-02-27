#!/usr/bin/env bash
set -euo pipefail
exec asc "$1" --outFile "${1%.ts}.wasm"
