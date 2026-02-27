#!/usr/bin/env bash
set -euo pipefail
command -v bitwuzla >/dev/null 2>&1 || python3 -c "import bitwuzla" 2>/dev/null
