#!/usr/bin/env bash
set -euo pipefail
OUT="/tmp/cuda_out_$$"
nvcc "$1" -o "$OUT" && "$OUT"
rm -f "$OUT"
