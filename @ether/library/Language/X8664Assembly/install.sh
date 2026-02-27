#!/usr/bin/env bash
set -euo pipefail
# x86-64 Assembly - requires NASM or GAS (GNU Assembler)
if [[ "$(uname)" == "Darwin" ]]; then
  brew install nasm
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y nasm gcc
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y nasm gcc
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm nasm gcc
else
  echo "Unsupported package manager." >&2; exit 1
fi
