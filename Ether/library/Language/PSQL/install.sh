#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install postgresql
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y postgresql-client
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y postgresql
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm postgresql
else
  echo "Unsupported package manager." >&2; exit 1
fi
