#!/usr/bin/env bash
set -euo pipefail
OUT="/tmp/conpas_out_$$"
fpc -o"$OUT" "$1" && "$OUT"
rm -f "$OUT"
