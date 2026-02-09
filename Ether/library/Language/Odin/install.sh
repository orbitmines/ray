#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Odin from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/odin-lang/Odin"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/odin-lang/Odin.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  make
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install odin
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm odin
else
  echo "No official package available. Use --from-source." >&2; exit 1
fi
