#!/usr/bin/env bash
set -euo pipefail
file="$1"
out="/tmp/halide_out"
g++ "$file" -lHalide -lpthread -ldl -o "$out" && "$out"
