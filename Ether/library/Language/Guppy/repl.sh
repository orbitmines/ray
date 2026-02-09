#!/usr/bin/env bash
set -euo pipefail
exec python3 -c "import guppylang; import code; code.interact(local={'guppylang': guppylang})"
