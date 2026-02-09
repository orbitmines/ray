#!/usr/bin/env bash
set -euo pipefail
# Install Doxygen - https://www.doxygen.nl/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/doxygen/doxygen"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/doxygen/doxygen.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cmake -S . -B build -G "Unix Makefiles" && cmake --build build -j"$(nproc)" && sudo cmake --install build
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install doxygen
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y doxygen
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y doxygen
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm doxygen
else
  echo "Unsupported package manager. Use FROM_SOURCE=true." >&2; exit 1
fi
