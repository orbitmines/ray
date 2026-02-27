#!/usr/bin/env bash
set -euo pipefail
# M4 - GNU macro processor - https://www.gnu.org/software/m4/
if [[ "$(uname)" == "Darwin" ]]; then
  brew install m4
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y m4
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y m4
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm m4
else
  echo "Unsupported package manager." >&2; exit 1
fi
