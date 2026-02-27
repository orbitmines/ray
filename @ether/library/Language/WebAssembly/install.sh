#!/usr/bin/env bash
set -euo pipefail
# WebAssembly tooling: wabt (WebAssembly Binary Toolkit) + wasmtime runtime
# https://webassembly.org/
if [[ "$(uname)" == "Darwin" ]]; then
  brew install wabt wasmtime
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y wabt
  # wasmtime via official installer
  curl https://wasmtime.dev/install.sh -sSf | bash
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y wabt
  curl https://wasmtime.dev/install.sh -sSf | bash
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm wabt wasmtime
else
  echo "Unsupported package manager." >&2; exit 1
fi
