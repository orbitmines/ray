#!/usr/bin/env bash
set -euo pipefail
# Install Gen.jl - https://www.gen.dev/ https://github.com/probcomp/Gen.jl
# Gen is a Julia package for probabilistic programming
if command -v julia >/dev/null 2>&1; then
  julia -e 'using Pkg; Pkg.add("Gen")'
else
  echo "Julia is required. Install Julia first, then: julia -e 'using Pkg; Pkg.add(\"Gen\")'" >&2; exit 1
fi
