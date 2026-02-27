#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install gnucobol
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y gnucobol
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y gnucobol
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm gnucobol
else
  echo "Unsupported package manager. Install GnuCOBOL manually." >&2; exit 1
fi
