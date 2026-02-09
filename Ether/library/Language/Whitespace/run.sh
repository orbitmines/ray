#!/usr/bin/env bash
set -euo pipefail
if command -v wspace >/dev/null 2>&1; then
  exec wspace "$1"
elif command -v whitespace >/dev/null 2>&1; then
  exec whitespace "$1"
else
  echo "No Whitespace interpreter found." >&2; exit 1
fi
