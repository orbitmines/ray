#!/usr/bin/env bash
set -euo pipefail
# Metamath - https://github.com/metamath/metamath-exe
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/metamath/metamath-exe"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/metamath/metamath-exe.git "$REPO_DIR"
fi
cd "$REPO_DIR"
if [[ -f CMakeLists.txt ]]; then
  mkdir -p build && cd build && cmake .. && make -j"$(nproc)"
  sudo make install
elif [[ -f Makefile ]]; then
  make -j"$(nproc)"
  sudo cp metamath /usr/local/bin/
else
  gcc -O2 -o metamath src/*.c
  sudo cp metamath /usr/local/bin/
fi
