#!/usr/bin/env bash
set -euo pipefail
if command -v valec >/dev/null 2>&1; then
  valec build "$1" -o /tmp/vale_out && /tmp/vale_out
else
  vale run "$1"
fi
