#!/usr/bin/env bash
set -euo pipefail
# Tree-sitter: incremental parsing library - https://tree-sitter.github.io/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/tree-sitter/tree-sitter"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/tree-sitter/tree-sitter.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cargo build --release
  cp target/release/tree-sitter "$HOME/.local/bin/" 2>/dev/null || sudo cp target/release/tree-sitter /usr/local/bin/
  exit 0
fi
if command -v cargo >/dev/null 2>&1; then
  cargo install tree-sitter-cli
elif command -v npm >/dev/null 2>&1; then
  npm install -g tree-sitter-cli
else
  echo "Requires cargo or npm." >&2; exit 1
fi
