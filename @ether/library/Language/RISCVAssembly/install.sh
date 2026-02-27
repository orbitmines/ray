#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew tap riscv-software-src/riscv
  brew install riscv-tools
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y gcc-riscv64-linux-gnu binutils-riscv64-linux-gnu qemu-user
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y gcc-riscv64-linux-gnu binutils-riscv64-linux-gnu qemu-user
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm riscv64-linux-gnu-gcc riscv64-linux-gnu-binutils qemu-user
else
  echo "Unsupported package manager." >&2; exit 1
fi
