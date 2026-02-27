#!/usr/bin/env bash
set -euo pipefail
if command -v stanc >/dev/null 2>&1; then
  exec stanc "$@"
else
  exec python3 -c "
import cmdstanpy, sys
model = cmdstanpy.CmdStanModel(stan_file=sys.argv[1])
print(model.exe_info())
" "$@"
fi
