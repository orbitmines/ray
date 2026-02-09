#!/usr/bin/env bash
set -euo pipefail
echo "Installing Nelua from source..."
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/edubart/nelua-lang"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/edubart/nelua-lang.git "$REPO_DIR"
fi
cd "$REPO_DIR"
make
sudo make install
