#!/usr/bin/env bash
set -euo pipefail
# GNU sed - https://www.gnu.org/software/sed/
if [[ "$(uname)" == "Darwin" ]]; then
  brew install gnu-sed
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y sed
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y sed
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm sed
fi
