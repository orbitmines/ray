#!/usr/bin/env bash
set -euo pipefail
exec python3 -c "import keras; import code; code.interact(local={'keras': keras})"
