#!/usr/bin/env bash
set -euo pipefail
# V language - https://vlang.io/
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/vlang/v"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/vlang/v.git "$REPO_DIR"
fi
cd "$REPO_DIR"
make
sudo ./v symlink || { mkdir -p "$HOME/.local/bin" && ln -sf "$REPO_DIR/v" "$HOME/.local/bin/v"; }
