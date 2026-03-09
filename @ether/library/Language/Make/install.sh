#!/usr/bin/env bash
set -euo pipefail
# GNU Make - https://www.gnu.org/software/make/
if [[ "$(uname)" == "Darwin" ]]; then
  brew install make
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y make
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y make
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm make
else
  echo "Unsupported package manager." >&2; exit 1
fi
