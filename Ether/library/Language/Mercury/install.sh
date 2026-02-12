#!/usr/bin/env bash
set -euo pipefail
# Mercury - https://www.mercurylang.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/Mercury-Language/mercury"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/Mercury-Language/mercury.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  ./configure && make PARALLEL=-j"$(nproc)"
  sudo make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install mercury
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y mercury
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y mercury
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm mercury
else
  echo "Unsupported package manager. Use FROM_SOURCE=true." >&2; exit 1
fi
