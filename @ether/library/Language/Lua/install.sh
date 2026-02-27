#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install lua
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y lua5.4
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y lua
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm lua
else
  echo "Unsupported package manager." >&2; exit 1
fi
