#!/usr/bin/env bash
set -euo pipefail
if command -v nim >/dev/null 2>&1; then
  exec nim secret "$@"
else
  echo "Nim is not installed."
  exit 1
fi
