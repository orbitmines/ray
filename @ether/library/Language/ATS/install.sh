#!/usr/bin/env bash
set -euo pipefail
# ATS - Applied Type System (ATS2/Postiats)
if [[ "$(uname)" == "Darwin" ]]; then
  brew install ats2-postiats
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y ats2-lang
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y ats2-lang || true
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm ats2 || true
fi
# Fall back to from-source if package not available
if ! command -v patscc >/dev/null 2>&1; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/githwxi/ATS-Postiats"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/githwxi/ATS-Postiats.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  ./configure && make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
  sudo make install || cp bin/patscc "$HOME/.local/bin/"
fi
