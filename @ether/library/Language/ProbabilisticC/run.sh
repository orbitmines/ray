#!/usr/bin/env bash
set -euo pipefail
INPUT="$1"; shift
OUT="$(mktemp)"
gcc -o "$OUT" "$INPUT" -lm "$@"
"$OUT"
rm -f "$OUT"
