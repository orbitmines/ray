#!/usr/bin/env bash
set -euo pipefail
if command -v r3 >/dev/null 2>&1; then
  exec r3
elif command -v rebol >/dev/null 2>&1; then
  exec rebol
else
  echo "Neither r3 nor rebol found in PATH." >&2; exit 1
fi
