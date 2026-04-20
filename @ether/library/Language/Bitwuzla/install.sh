#!/usr/bin/env bash
set -euo pipefail
# Bitwuzla - SMT solver for bit-vectors and arrays
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/bitwuzla/bitwuzla"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/bitwuzla/bitwuzla.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  ./configure.py && cd build && ninja -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
  sudo ninja install || cp bin/bitwuzla "$HOME/.local/bin/"
  exit 0
fi
pip install bitwuzla
