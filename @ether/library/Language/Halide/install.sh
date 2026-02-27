#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Halide from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/halide/Halide"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/halide/Halide.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cmake -B build -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$HOME/.local" && cmake --build build -j"$(nproc)" && cmake --install build
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install halide
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y libhalide-dev
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm halide
else
  echo "Install from source or use prebuilt release from GitHub." >&2
  echo "See: https://github.com/halide/Halide/releases" >&2
  exit 1
fi
