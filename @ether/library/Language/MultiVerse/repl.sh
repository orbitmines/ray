#!/usr/bin/env bash
set -euo pipefail
exec python3 -c "import multiverse; help(multiverse)" 2>/dev/null || exec python3
