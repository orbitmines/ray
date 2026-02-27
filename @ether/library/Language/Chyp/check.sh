#!/usr/bin/env bash
set -euo pipefail
command -v chyp >/dev/null 2>&1 || python3 -c "import chyp" 2>/dev/null
