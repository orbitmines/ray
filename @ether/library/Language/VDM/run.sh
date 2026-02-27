#!/usr/bin/env bash
set -euo pipefail
if command -v overture >/dev/null 2>&1; then
  exec overture "$1"
else
  exec java -jar "$HOME/.local/lib/overture/overture.jar" "$1"
fi
