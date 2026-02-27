#!/usr/bin/env bash
set -euo pipefail
if command -v joy >/dev/null 2>&1; then
  exec joy
else
  exec python3 -m joy
fi
