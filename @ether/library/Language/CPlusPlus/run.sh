#!/usr/bin/env bash
set -euo pipefail
file="$1"
out="/tmp/cpp_out_$$"
g++ "$file" -o "$out" && "$out"
rm -f "$out"
