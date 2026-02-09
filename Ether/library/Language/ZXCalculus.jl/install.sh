#!/usr/bin/env bash
set -euo pipefail
# ZXCalculus.jl - Julia package for ZX-calculus
# https://github.com/QuantumBFS/ZXCalculus.jl
command -v julia >/dev/null 2>&1 || { echo "Julia is required." >&2; exit 1; }
julia -e 'using Pkg; Pkg.add("ZXCalculus")'
