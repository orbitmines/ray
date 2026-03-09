#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install cvc5 || {
    pip install cvc5 || pip3 install cvc5
  }
elif command -v pip3 >/dev/null 2>&1; then
  pip3 install cvc5
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/cvc5/cvc5"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/cvc5/cvc5.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  ./configure.sh production --auto-download
  cd build
  make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
  sudo make install
fi
