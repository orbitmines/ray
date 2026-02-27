#!/usr/bin/env bash
set -euo pipefail
# SQL: uses SQLite3 as default engine - https://www.sqlite.org/
if [[ "$(uname)" == "Darwin" ]]; then
  brew install sqlite3
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y sqlite3
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y sqlite
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm sqlite
else
  echo "Unsupported package manager." >&2; exit 1
fi
