#!/usr/bin/env bash
set -euo pipefail
# Wren - https://wren.io/
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/wren-lang/wren"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/wren-lang/wren.git "$REPO_DIR"
fi
cd "$REPO_DIR"
make
mkdir -p "$HOME/.local/bin"
cp bin/wren "$HOME/.local/bin/" 2>/dev/null || cp wren "$HOME/.local/bin/" 2>/dev/null || true
