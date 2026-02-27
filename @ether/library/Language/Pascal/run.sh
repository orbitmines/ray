#!/usr/bin/env bash
set -euo pipefail
INPUT="$1"; shift
OUT="$(mktemp)"
fpc -o"$OUT" "$INPUT"
"$OUT" "$@"
rm -f "$OUT"
