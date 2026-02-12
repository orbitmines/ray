#!/usr/bin/env bash
set -euo pipefail
command -v whenever >/dev/null 2>&1 || python3 -c "import whenever_lang" 2>/dev/null
