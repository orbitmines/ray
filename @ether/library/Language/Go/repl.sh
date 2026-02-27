#!/usr/bin/env bash
set -euo pipefail
if command -v gore >/dev/null 2>&1; then
  exec gore "$@"
elif command -v yaegi >/dev/null 2>&1; then
  exec yaegi "$@"
else
  echo "No Go REPL found."
  echo "Install gore: go install github.com/x-motemen/gore/cmd/gore@latest"
  echo "Install yaegi: go install github.com/traefik/yaegi/cmd/yaegi@latest"
  exit 1
fi
