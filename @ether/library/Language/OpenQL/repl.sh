#!/usr/bin/env bash
set -euo pipefail
exec python3 -c "import openql; import code; code.interact(local={'openql': openql})"
