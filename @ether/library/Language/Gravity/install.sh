#!/usr/bin/env bash
set -euo pipefail
# Gravity programming language
echo "Installing Gravity from source..."
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/marcobambini/gravity"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/marcobambini/gravity.git "$REPO_DIR"
fi
cd "$REPO_DIR"
mkdir -p build && cd build
cmake ..
make -j"$(nproc)"
sudo cp gravity /usr/local/bin/
