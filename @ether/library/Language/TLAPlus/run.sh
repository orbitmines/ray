#!/usr/bin/env bash
set -euo pipefail
if command -v tlc >/dev/null 2>&1; then
  exec tlc "$@"
else
  exec java -cp "$HOME/.local/lib/tla/tla2tools.jar" tlc2.TLC "$@"
fi
