#!/usr/bin/env bash
set -euo pipefail
# MIPS Assembly - install SPIM simulator
# https://en.wikipedia.org/wiki/MIPS_architecture
if [[ "$(uname)" == "Darwin" ]]; then
  brew install spim
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y spim
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y spim
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm spim
else
  echo "Unsupported package manager." >&2; exit 1
fi
