#!/usr/bin/env bash
set -euo pipefail
# Befunge - esoteric 2D stack-based language
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/catseye/Befunge-93"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/catseye/Befunge-93.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  if [[ -f Makefile ]]; then
    make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
  fi
  sudo cp bin/bef /usr/local/bin/ 2>/dev/null || cp bin/bef "$HOME/.local/bin/" 2>/dev/null || true
  exit 0
fi
pip install befungee
