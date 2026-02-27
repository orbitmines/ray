#!/usr/bin/env bash
set -euo pipefail
if command -v bal >/dev/null 2>&1; then
  exec bal shell
else
  echo "Ballerina is not installed." >&2; exit 1
fi
