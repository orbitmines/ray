#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Kind from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/HigherOrderCO/Kind"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/HigherOrderCO/Kind.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cargo build --release && cp target/release/kind "$HOME/.local/bin/"
  exit 0
fi
# Official install via cargo (https://github.com/HigherOrderCO/Kind)
cargo install kind-lang
