#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Nushell from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/nushell/nushell"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/nushell/nushell.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  cargo build --release
  cp target/release/nu "$HOME/.local/bin/"
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install nushell
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y nushell || {
    cargo install nu
  }
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y nushell || cargo install nu
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm nushell
else
  cargo install nu
fi
