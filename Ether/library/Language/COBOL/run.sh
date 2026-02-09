#!/usr/bin/env bash
set -euo pipefail
OUT="/tmp/cobol_out_$$"
cobc -x -o "$OUT" "$1" && "$OUT"
rm -f "$OUT"
