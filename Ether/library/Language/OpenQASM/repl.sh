#!/usr/bin/env bash
set -euo pipefail
exec python3 -c "import openqasm3; import code; code.interact(local={'openqasm3': openqasm3})"
