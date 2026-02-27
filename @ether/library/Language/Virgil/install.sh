#!/usr/bin/env bash
set -euo pipefail
# Virgil - https://github.com/titzer/virgil
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/titzer/virgil"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/titzer/virgil.git "$REPO_DIR"
fi
cd "$REPO_DIR"
make
mkdir -p "$HOME/.local/bin"
ln -sf "$REPO_DIR/bin/v3c" "$HOME/.local/bin/v3c"
ln -sf "$REPO_DIR/bin/v3i" "$HOME/.local/bin/v3i"
