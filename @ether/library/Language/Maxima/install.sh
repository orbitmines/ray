#!/usr/bin/env bash
set -euo pipefail
# Maxima - https://maxima.sourceforge.io/
if [[ "$(uname)" == "Darwin" ]]; then
  brew install maxima
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y maxima
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y maxima
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm maxima
else
  echo "Unsupported package manager." >&2; exit 1
fi
