#!/usr/bin/env bash
set -euo pipefail
# ><> (Fish) esoteric language
if command -v fish-lang >/dev/null 2>&1; then
  exec fish-lang "$1"
else
  exec python3 -m fish "$1" 2>/dev/null || {
    echo "><> (Fish) interpreter not found." >&2; exit 1
  }
fi
