#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install clasp-solver || brew install clingo
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y clasp || sudo apt-get install -y gringo clasp
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y clasp || {
    REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/potassco/clasp"
    if [[ -d "$REPO_DIR/.git" ]]; then
      GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
    else
      mkdir -p "$(dirname "$REPO_DIR")"
      GIT_TERMINAL_PROMPT=0 git clone https://github.com/potassco/clasp.git "$REPO_DIR"
    fi
    cd "$REPO_DIR"
    mkdir -p build && cd build
    cmake .. && make -j"$(nproc)"
    sudo make install
  }
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm clasp
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/potassco/clasp"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/potassco/clasp.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  mkdir -p build && cd build
  cmake .. && make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
  sudo make install
fi
