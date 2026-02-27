#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing OSH (Oils) from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/oils-for-unix/oils"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/oils-for-unix/oils.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  ./configure
  make
  sudo make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install oils-for-unix
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y oils-for-unix || {
    echo "Package not found. Use --from-source." >&2; exit 1
  }
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm oils-for-unix
else
  echo "Unsupported package manager. Use --from-source." >&2; exit 1
fi
