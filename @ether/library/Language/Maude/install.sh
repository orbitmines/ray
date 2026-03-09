#!/usr/bin/env bash
set -euo pipefail
# Maude - http://maude.cs.illinois.edu/
# https://github.com/SRI-CSL/Maude
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/SRI-CSL/Maude"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/SRI-CSL/Maude.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  autoreconf -i
  ./configure && make -j"$(nproc)"
  sudo make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install maude
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y maude
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm maude
else
  echo "Download binaries from: http://maude.cs.illinois.edu/w/index.php/Maude_download_and_installation" >&2
  exit 1
fi
