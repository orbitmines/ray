#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Python from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/python/cpython"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/python/cpython.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  ./configure --prefix="$HOME/.local" && make -j"$(nproc)" && make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install python3
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y python3 python3-pip python3-venv
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y python3 python3-pip
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm python python-pip
else
  echo "Unsupported package manager. Use --from-source." >&2; exit 1
fi
