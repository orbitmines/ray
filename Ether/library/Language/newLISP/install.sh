#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing newLISP from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/kosh04/newlisp"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/kosh04/newlisp.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  make -j"$(nproc)"
  sudo make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install newlisp
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y newlisp
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y newlisp
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm newlisp
else
  echo "Unsupported package manager. Use --from-source." >&2; exit 1
fi
