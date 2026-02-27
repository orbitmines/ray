#!/usr/bin/env bash
set -euo pipefail
target="$1"
if [[ -f "$target" ]]; then
  docker build -f "$target" .
elif [[ -d "$target" ]]; then
  cd "$target" && docker compose up 2>/dev/null || docker-compose up
fi
