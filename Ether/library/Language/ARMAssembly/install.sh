#!/usr/bin/env bash
set -euo pipefail
# ARM Assembly - cross-compiler toolchain
if [[ "$(uname)" == "Darwin" ]]; then
  brew install arm-linux-gnueabihf-binutils 2>/dev/null || brew install binutils 2>/dev/null || true
elif command -v apt-get &>/dev/null; then
  sudo apt-get update && sudo apt-get install -y gcc-arm-linux-gnueabihf binutils-aarch64-linux-gnu qemu-user
elif command -v dnf &>/dev/null; then
  sudo dnf install -y gcc-arm-linux-gnu binutils-aarch64-linux-gnu qemu-user
elif command -v pacman &>/dev/null; then
  sudo pacman -S --noconfirm arm-none-eabi-gcc arm-none-eabi-binutils qemu-user
else
  echo "Unsupported package manager. Please install ARM cross-compilation tools manually." >&2; exit 1
fi
