#!/usr/bin/env bash
set -euo pipefail
# staq: quantum compilation toolkit - https://github.com/softwareQinc/staq
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y build-essential cmake
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y gcc gcc-c++ cmake
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm base-devel cmake
elif [[ "$(uname)" == "Darwin" ]]; then
  brew install cmake
fi
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/softwareQinc/staq"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/softwareQinc/staq.git "$REPO_DIR"
fi
cd "$REPO_DIR" && cmake -B build && cmake --build build -j"$(nproc)" && sudo cmake --install build
