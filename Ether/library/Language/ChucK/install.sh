#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install chuck
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y chuck
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y chuck || {
    REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/ccrma/chuck"
    if [[ -d "$REPO_DIR/.git" ]]; then
      GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
    else
      mkdir -p "$(dirname "$REPO_DIR")"
      GIT_TERMINAL_PROMPT=0 git clone https://github.com/ccrma/chuck.git "$REPO_DIR"
    fi
    cd "$REPO_DIR/src"
    make linux-alsa
    sudo cp chuck /usr/local/bin/
  }
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm chuck
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/ccrma/chuck"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/ccrma/chuck.git "$REPO_DIR"
  fi
  cd "$REPO_DIR/src"
  make linux-alsa
  sudo cp chuck /usr/local/bin/
fi
