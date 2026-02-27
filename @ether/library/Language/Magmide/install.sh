#!/usr/bin/env bash
set -euo pipefail
# Magmide - https://github.com/magmide/magmide
# Research proof language (work in progress)
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/magmide/magmide"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/magmide/magmide.git "$REPO_DIR"
fi
cd "$REPO_DIR"
command -v cargo >/dev/null 2>&1 || { echo "Rust/Cargo required." >&2; exit 1; }
cargo build --release
