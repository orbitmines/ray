#!/usr/bin/env bash
set -euo pipefail
# LFSC - Logical Framework with Side Conditions
# https://github.com/cvc5/LFSC
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/cvc5/LFSC"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/cvc5/LFSC.git "$REPO_DIR"
fi
cd "$REPO_DIR"
mkdir -p build && cd build
cmake .. && make -j"$(nproc)"
sudo make install
