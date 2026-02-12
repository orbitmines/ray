#!/usr/bin/env bash
set -euo pipefail
# Bluespec - hardware description language (BSC compiler)
if [[ "$(uname)" == "Darwin" ]]; then
  brew install bluespec || true
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y ghc libghc-regex-compat-dev libghc-syb-dev libghc-old-time-dev tcl-dev autoconf
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y ghc ghc-regex-compat-devel ghc-syb-devel tcl-devel autoconf
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm ghc tcl autoconf
fi
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/B-Lang-org/bsc"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone --recursive https://github.com/B-Lang-org/bsc.git "$REPO_DIR"
fi
cd "$REPO_DIR"
make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
sudo make install PREFIX=/usr/local || cp inst/bin/bsc "$HOME/.local/bin/"
