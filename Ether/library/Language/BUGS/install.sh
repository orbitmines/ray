#!/usr/bin/env bash
set -euo pipefail
# BUGS models are typically run via R (R2OpenBUGS/R2WinBUGS) or Julia (JuliaBUGS.jl)
if command -v julia >/dev/null 2>&1; then
  julia -e 'using Pkg; Pkg.add("JuliaBUGS")'
elif command -v Rscript >/dev/null 2>&1; then
  Rscript -e 'install.packages("R2OpenBUGS", repos="https://cran.r-project.org")'
else
  echo "Install Julia or R first to use BUGS models." >&2
  exit 1
fi
