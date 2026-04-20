#!/usr/bin/env bash
set -euo pipefail
exec python3 -c "import numpyro; print('NumPyro', numpyro.__version__); import code; code.interact(local={'numpyro': numpyro})"
