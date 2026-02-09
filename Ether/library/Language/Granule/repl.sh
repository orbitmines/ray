#!/usr/bin/env bash
set -euo pipefail
if command -v grepl >/dev/null 2>&1; then
  exec grepl
else
  exec granule --repl
fi
