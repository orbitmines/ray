#!/usr/bin/env bash
set -euo pipefail
if command -v flix >/dev/null 2>&1; then
  exec flix run "$1"
else
  exec java -jar "$HOME/.flix/flix.jar" run "$1"
fi
