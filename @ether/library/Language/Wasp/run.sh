#!/usr/bin/env bash
set -euo pipefail
if [[ -d "$1" ]]; then
  cd "$1" && wasp start
else
  echo "Wasp expects a project directory, not a single file." >&2
  exit 1
fi
