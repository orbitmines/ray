#!/usr/bin/env bash
set -euo pipefail
# Vampire theorem prover - https://vprover.github.io/
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/vprover/vampire"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/vprover/vampire.git "$REPO_DIR"
fi
cd "$REPO_DIR"
mkdir -p build && cd build
cmake .. && make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
mkdir -p "$HOME/.local/bin"
cp bin/vampire "$HOME/.local/bin/" || true
