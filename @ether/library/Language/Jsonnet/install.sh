#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Jsonnet from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/google/jsonnet"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/google/jsonnet.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && make -j"$(nproc)" && sudo cp jsonnet jsonnetfmt /usr/local/bin/
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install jsonnet
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y jsonnet
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y jsonnet
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm jsonnet
else
  # Fallback: install Go implementation
  go install github.com/google/go-jsonnet/cmd/jsonnet@latest
fi
