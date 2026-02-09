#!/usr/bin/env bash
set -euo pipefail
file="$1"
out="/tmp/c_out_$$"
gcc "$file" -o "$out" && "$out"
rm -f "$out"
