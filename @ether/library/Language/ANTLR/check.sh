#!/usr/bin/env bash
set -euo pipefail
command -v antlr4 &>/dev/null || command -v antlr &>/dev/null || python3 -c "import antlr4" 2>/dev/null
