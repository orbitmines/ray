#!/usr/bin/env bash
set -euo pipefail
# Install Dyon - https://github.com/PistonDevelopers/dyon
if command -v cargo >/dev/null 2>&1; then
  cargo install dyon_interactive
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/PistonDevelopers/dyon"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/PistonDevelopers/dyon.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cargo build --release
fi
