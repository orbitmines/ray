#!/usr/bin/env bash
set -euo pipefail
# Yatima - https://github.com/argumentcomputer/yatima
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/argumentcomputer/yatima"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/argumentcomputer/yatima.git "$REPO_DIR"
fi
cd "$REPO_DIR"
command -v cargo >/dev/null 2>&1 || { echo "Rust/Cargo required to build Yatima." >&2; exit 1; }
cargo build --release
mkdir -p "$HOME/.local/bin"
cp target/release/yatima "$HOME/.local/bin/" 2>/dev/null || true
