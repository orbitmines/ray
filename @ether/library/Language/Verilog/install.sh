#!/usr/bin/env bash
set -euo pipefail
# Verilog - hardware description language
# Icarus Verilog is the standard open-source simulator
if [[ "$(uname)" == "Darwin" ]]; then
  brew install icarus-verilog
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y iverilog
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y iverilog
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm iverilog
else
  echo "Unsupported package manager." >&2; exit 1
fi
