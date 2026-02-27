#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing glslang from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/KhronosGroup/glslang"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/KhronosGroup/glslang.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cmake -B build -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$HOME/.local" && cmake --build build -j"$(nproc)" && cmake --install build
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install glslang
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y glslang-tools
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y glslang
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm glslang
else
  echo "Unsupported package manager. Use --from-source." >&2; exit 1
fi
