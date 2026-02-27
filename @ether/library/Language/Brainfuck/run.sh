#!/usr/bin/env bash
set -euo pipefail
if command -v bf >/dev/null 2>&1; then
  exec bf "$1"
elif command -v brainfuck >/dev/null 2>&1; then
  exec brainfuck "$1"
else
  echo "No brainfuck interpreter found." >&2; exit 1
fi
