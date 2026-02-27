#!/usr/bin/env bash
set -euo pipefail
# Terra: low-level system programming language - https://terralang.org/
# Requires LLVM and Clang
if [[ "$(uname)" == "Darwin" ]]; then
  brew install llvm cmake
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y build-essential cmake llvm-dev clang libclang-dev
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y gcc gcc-c++ cmake llvm-devel clang-devel
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm base-devel cmake llvm clang
fi
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/terralang/terra"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/terralang/terra.git "$REPO_DIR"
fi
cd "$REPO_DIR" && cmake -B build && cmake --build build -j"$(nproc)"
