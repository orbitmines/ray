#!/usr/bin/env bash
set -euo pipefail
command -v alchemy &>/dev/null || python3 -c "import alchemy" 2>/dev/null
