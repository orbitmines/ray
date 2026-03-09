#!/usr/bin/env bash
set -euo pipefail
# Aiken: Cardano smart contract language - https://aiken-lang.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/aiken-lang/aiken"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/aiken-lang/aiken.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cargo build --release
  exit 0
fi
if command -v cargo >/dev/null 2>&1; then
  cargo install aiken
elif command -v curl >/dev/null 2>&1; then
  curl -sSfL https://install.aiken-lang.org | bash
else
  echo "Install Rust/Cargo first, then run: cargo install aiken" >&2
  exit 1
fi
