#!/usr/bin/env bash
set -euo pipefail
if command -v reply >/dev/null 2>&1; then
  exec reply
fi
exec perl -de0
