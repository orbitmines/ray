#!/usr/bin/env bash
set -euo pipefail
command -v cvc5 >/dev/null 2>&1 || python3 -c "import cvc5" 2>/dev/null
