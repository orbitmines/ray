#!/usr/bin/env bash
set -euo pipefail
exec python3 -c "import numpy as np; print('NumPy', np.__version__); import code; code.interact(local={'np': np})"
