#!/usr/bin/env bash
set -euo pipefail
# Install Forth (gforth) - https://forth-standard.org/
if [[ "$(uname)" == "Darwin" ]]; then
  brew install gforth
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y gforth
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y gforth
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm gforth
else
  echo "Unsupported package manager." >&2; exit 1
fi
