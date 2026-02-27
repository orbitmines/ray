#!/usr/bin/env bash
set -euo pipefail
if command -v fuzz >/dev/null 2>&1; then
  exec fuzz "$1"
elif command -v czt >/dev/null 2>&1; then
  exec czt "$1"
else
  cat "$1"
fi
