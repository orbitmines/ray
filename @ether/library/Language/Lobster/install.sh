#!/usr/bin/env bash
set -euo pipefail
# Lobster - https://strlen.com/lobster/
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/aardappel/lobster"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/aardappel/lobster.git "$REPO_DIR"
fi
cd "$REPO_DIR/dev"
cmake -DCMAKE_BUILD_TYPE=Release . && make -j"$(nproc)"
echo "Lobster built at: $REPO_DIR/dev/lobster"
