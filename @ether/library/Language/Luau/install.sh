#!/usr/bin/env bash
set -euo pipefail
# Luau - https://luau.org/
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/luau-lang/luau"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/luau-lang/luau.git "$REPO_DIR"
fi
cd "$REPO_DIR"
mkdir -p build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release && cmake --build . --target Luau.Repl.CLI -j"$(nproc)"
echo "Luau built at: $REPO_DIR/build"
