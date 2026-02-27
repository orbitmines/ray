#!/usr/bin/env bash
set -euo pipefail
if command -v whenever >/dev/null 2>&1; then
  exec whenever "$1"
else
  exec python3 -m whenever_lang "$1"
fi
