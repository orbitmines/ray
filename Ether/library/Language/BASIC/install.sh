#!/usr/bin/env bash
set -euo pipefail
# BASIC - FreeBASIC compiler
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/freebasic/fbc"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/freebasic/fbc.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
  sudo make install || cp bin/fbc "$HOME/.local/bin/"
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install freebasic
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y freebasic
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y freebasic
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm freebasic
else
  echo "No package manager found. Use FROM_SOURCE=true." >&2; exit 1
fi
