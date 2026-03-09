#!/usr/bin/env bash
set -euo pipefail
echo "Installing MIT-Picture from source..."
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/mrkulk/MIT-Picture"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/mrkulk/MIT-Picture.git "$REPO_DIR"
fi
echo "MIT-Picture source cloned to $REPO_DIR."
echo "Requires Julia. See README for setup instructions."
