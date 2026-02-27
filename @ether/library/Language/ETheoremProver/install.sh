#!/usr/bin/env bash
set -euo pipefail
# Install E Theorem Prover - https://github.com/eprover/eprover
# https://wwwlehre.dhbw-stuttgart.de/~sschulz/E/E.html
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/eprover/eprover"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/eprover/eprover.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && ./configure && make -j"$(nproc)" && sudo make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install eprover
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y eprover
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm eprover
else
  echo "Unsupported package manager. Use FROM_SOURCE=true." >&2; exit 1
fi
