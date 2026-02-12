#!/usr/bin/env bash
set -euo pipefail
# ALGOL 68 - algol68g interpreter
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/NevilleDNZ/algol68g-mirror"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/NevilleDNZ/algol68g-mirror.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  ./configure --prefix="$HOME/.local"
  make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
  make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install algol68g
elif command -v apt-get &>/dev/null; then
  sudo apt-get update && sudo apt-get install -y algol68g
elif command -v dnf &>/dev/null; then
  sudo dnf install -y algol68g
elif command -v pacman &>/dev/null; then
  echo "Install algol68g from AUR: yay -S algol68g" >&2; exit 1
else
  echo "Unsupported package manager. Use FROM_SOURCE=true." >&2; exit 1
fi
