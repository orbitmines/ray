#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/ziglang/zig"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/ziglang/zig.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && mkdir -p build && cd build && cmake .. && make -j"$(nproc)"
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install zig
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm zig
elif command -v snap >/dev/null 2>&1; then
  sudo snap install zig --classic --beta
else
  echo "Install via snap: sudo snap install zig --classic --beta" >&2
  echo "Or download from https://ziglang.org/download/" >&2
  exit 1
fi
