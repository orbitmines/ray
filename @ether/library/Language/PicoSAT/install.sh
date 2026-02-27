#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install picosat
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y picosat
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y picosat
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm picosat
else
  echo "Unsupported package manager." >&2; exit 1
fi
