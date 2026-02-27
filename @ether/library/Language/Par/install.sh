#!/usr/bin/env bash
set -euo pipefail
echo "Installing Par from source..."
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/faiface/par-lang"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/faiface/par-lang.git "$REPO_DIR"
fi
cd "$REPO_DIR"
cargo build --release
cp target/release/par "$HOME/.local/bin/" 2>/dev/null || true
