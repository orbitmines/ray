#!/usr/bin/env bash
set -euo pipefail
if command -v cvc5 >/dev/null 2>&1; then
  exec cvc5 "$1"
else
  exec python3 -c "
import cvc5
import sys
with open(sys.argv[1]) as f:
    print(f.read())
" "$1"
fi
