#!/usr/bin/env bash
set -euo pipefail
# Ada - GNAT compiler
if [[ "$(uname)" == "Darwin" ]]; then
  brew install gcc
elif command -v apt-get &>/dev/null; then
  sudo apt-get update && sudo apt-get install -y gnat
elif command -v dnf &>/dev/null; then
  sudo dnf install -y gcc-gnat
elif command -v pacman &>/dev/null; then
  sudo pacman -S --noconfirm gcc-ada
else
  echo "Unsupported package manager. Please install GNAT manually." >&2; exit 1
fi
