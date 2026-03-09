#!/usr/bin/env bash
set -euo pipefail
# Clarity: Stacks blockchain smart contract language - https://clarity-lang.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/hirosystems/clarinet"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/hirosystems/clarinet.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cargo build --release
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install clarinet
elif command -v cargo >/dev/null 2>&1; then
  cargo install clarinet
else
  echo "Install Rust/Cargo first, then run: cargo install clarinet" >&2
  exit 1
fi
