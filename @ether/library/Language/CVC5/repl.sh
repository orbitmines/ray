#!/usr/bin/env bash
set -euo pipefail
if command -v cvc5 >/dev/null 2>&1; then
  exec cvc5 --interactive
else
  echo "CVC5 binary not found. Install cvc5 for interactive mode." >&2
  exit 1
fi
