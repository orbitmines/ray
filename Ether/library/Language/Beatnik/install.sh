#!/usr/bin/env bash
set -euo pipefail
# Beatnik - esoteric language based on Scrabble scores
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/catseye/Beatnik"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/catseye/Beatnik.git "$REPO_DIR"
fi
cd "$REPO_DIR"
if [[ -f Makefile ]]; then
  make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
fi
echo "Beatnik interpreter available at $REPO_DIR"
