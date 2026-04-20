#!/usr/bin/env bash
set -euo pipefail
if command -v agda >/dev/null 2>&1; then
  exec agda --interaction "$@"
else
  echo "Agda is not installed."
  echo "Agda is best used interactively via Emacs (agda-mode) or VS Code."
  exit 1
fi
