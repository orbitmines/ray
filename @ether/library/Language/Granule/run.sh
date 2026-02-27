#!/usr/bin/env bash
set -euo pipefail
if command -v gr >/dev/null 2>&1; then
  exec gr "$1"
else
  exec granule "$1"
fi
