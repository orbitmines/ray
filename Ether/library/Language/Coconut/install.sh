#!/usr/bin/env bash
set -euo pipefail
# Coconut - Python superset for functional programming
if command -v pip3 >/dev/null 2>&1; then
  pip3 install coconut
elif command -v pip >/dev/null 2>&1; then
  pip install coconut
else
  echo "pip/pip3 not found. Install Python first." >&2; exit 1
fi
