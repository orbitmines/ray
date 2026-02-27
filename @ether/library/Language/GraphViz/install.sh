#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing GraphViz from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/gitlab.com/graphviz/graphviz"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://gitlab.com/graphviz/graphviz.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cmake -B build -DCMAKE_INSTALL_PREFIX="$HOME/.local" && cmake --build build -j"$(nproc)" && cmake --install build
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install graphviz
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y graphviz
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y graphviz
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm graphviz
else
  echo "Unsupported package manager. Use --from-source." >&2; exit 1
fi
