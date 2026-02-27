#!/usr/bin/env bash
set -euo pipefail
exec python3 -c "import pomegranate; import code; code.interact(local={'pomegranate': pomegranate})"
