#!/usr/bin/env bash
set -euo pipefail
# Turing.jl: probabilistic programming in Julia - https://turinglang.org/
# Requires Julia
if ! command -v julia >/dev/null 2>&1; then
  echo "Julia is required. Install Julia first." >&2
  exit 1
fi
julia -e 'using Pkg; Pkg.add("Turing")'
