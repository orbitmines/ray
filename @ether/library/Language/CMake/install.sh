#!/usr/bin/env bash
set -euo pipefail
# CMake
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing CMake from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/Kitware/CMake"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/Kitware/CMake.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  ./bootstrap --prefix=/usr/local
  make -j"$(nproc)"
  sudo make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install cmake
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y cmake
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y cmake
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm cmake
else
  echo "Unsupported package manager. Download from https://cmake.org/download/" >&2; exit 1
fi
