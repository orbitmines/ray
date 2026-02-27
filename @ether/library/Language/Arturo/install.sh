#!/usr/bin/env bash
set -euo pipefail
# Arturo programming language
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Arturo from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/arturo-lang/arturo"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/arturo-lang/arturo.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  ./build.sh
  sudo cp bin/arturo /usr/local/bin/
  exit 0
fi
# Official installer
curl -sSL https://get.arturo-lang.io | sh
