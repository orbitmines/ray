#!/usr/bin/env bash
set -euo pipefail
# Move - https://github.com/move-language/move
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/move-language/move"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/move-language/move.git "$REPO_DIR"
fi
cd "$REPO_DIR"
command -v cargo >/dev/null 2>&1 || { echo "Rust/Cargo required." >&2; exit 1; }
cargo install --path language/tools/move-cli
