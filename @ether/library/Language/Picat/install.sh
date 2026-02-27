#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Picat from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/mingodad/picat"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/mingodad/picat.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  if [[ -d emu ]]; then
    cd emu
    make -f Makefile.linux
  fi
  exit 0
fi
echo "Download Picat from https://picat-lang.org/download.html"
echo "Extract and add to PATH."
exit 1
