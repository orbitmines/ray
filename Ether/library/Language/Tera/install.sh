#!/usr/bin/env bash
set -euo pipefail
# Tera: Rust template engine (Jinja2-like) - https://keats.github.io/tera/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/Keats/tera"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/Keats/tera.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cargo build --release
  exit 0
fi
cargo install tera-cli
