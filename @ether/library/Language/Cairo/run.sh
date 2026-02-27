#!/usr/bin/env bash
set -euo pipefail
if command -v scarb >/dev/null 2>&1; then
  exec scarb build "$@"
else
  exec cairo-run "$@"
fi
