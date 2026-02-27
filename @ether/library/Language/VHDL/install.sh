#!/usr/bin/env bash
set -euo pipefail
# VHDL - GHDL is the open-source VHDL simulator
# https://github.com/ghdl/ghdl
if [[ "$(uname)" == "Darwin" ]]; then
  brew install ghdl
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y ghdl
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y ghdl
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm ghdl-gcc || sudo pacman -S --noconfirm ghdl
else
  echo "Unsupported package manager." >&2; exit 1
fi
