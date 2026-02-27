#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install brainfuck
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y bf
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y brainfuck
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm brainfuck
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/fabianishere/brainfuck"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/fabianishere/brainfuck.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  mkdir -p build && cd build
  cmake .. && make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
  sudo make install || cp brainfuck "$HOME/.local/bin/"
fi
