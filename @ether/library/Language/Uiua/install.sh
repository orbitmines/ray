#!/usr/bin/env bash
set -euo pipefail
# Uiua: stack-based array language - https://www.uiua.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/uiua-lang/uiua"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/uiua-lang/uiua.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cargo build --release
  cp target/release/uiua "$HOME/.local/bin/" 2>/dev/null || sudo cp target/release/uiua /usr/local/bin/
  exit 0
fi
cargo install uiua
