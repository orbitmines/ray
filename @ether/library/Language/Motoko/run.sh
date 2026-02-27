#!/usr/bin/env bash
set -euo pipefail
if command -v moc >/dev/null 2>&1; then
  exec moc "$@"
else
  exec dfx build "$@"
fi
