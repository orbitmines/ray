#!/usr/bin/env bash
set -euo pipefail
# Stan: statistical modeling - https://mc-stan.org/
# Install CmdStan (command-line interface)
if [[ "$(uname)" == "Darwin" ]]; then
  brew install cmdstan
elif pip install cmdstanpy 2>/dev/null; then
  python3 -c "import cmdstanpy; cmdstanpy.install_cmdstan()"
else
  pip install cmdstanpy
  python3 -c "import cmdstanpy; cmdstanpy.install_cmdstan()"
fi
