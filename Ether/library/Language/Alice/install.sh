#!/usr/bin/env bash
set -euo pipefail
# Alice ML - functional programming language (successor to SML)
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/aliceml/aliceml"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/aliceml/aliceml.git "$REPO_DIR"
fi
cd "$REPO_DIR"
if [[ -f Makefile ]]; then
  make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)" || true
  sudo make install || true
elif [[ -f configure ]]; then
  ./configure --prefix="$HOME/.local"
  make && make install
fi
