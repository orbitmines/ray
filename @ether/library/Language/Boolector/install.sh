#!/usr/bin/env bash
set -euo pipefail
# Boolector - SMT solver for bit-vectors and arrays
if [[ "$(uname)" == "Darwin" ]]; then
  brew install cmake git || true
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y cmake build-essential
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y cmake gcc-c++ make
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm cmake base-devel
fi
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/Boolector/boolector"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/Boolector/boolector.git "$REPO_DIR"
fi
cd "$REPO_DIR"
./contrib/setup-lingeling.sh
./contrib/setup-btor2tools.sh
./configure.sh && cd build && make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
sudo make install || cp bin/boolector "$HOME/.local/bin/"
