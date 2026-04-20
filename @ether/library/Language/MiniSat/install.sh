#!/usr/bin/env bash
set -euo pipefail
# MiniSat - http://minisat.se/
# https://github.com/niklasso/minisat
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/niklasso/minisat"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/niklasso/minisat.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  make -j"$(nproc)"
  sudo make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install minisat
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y minisat
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y minisat2
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm minisat
else
  echo "Unsupported package manager. Use FROM_SOURCE=true." >&2; exit 1
fi
