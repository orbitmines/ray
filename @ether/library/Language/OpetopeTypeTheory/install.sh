#!/usr/bin/env bash
set -euo pipefail
echo "Installing Opetopic Type Theory from source..."
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/ericfinster/opetopic-types"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/ericfinster/opetopic-types.git "$REPO_DIR"
fi
cd "$REPO_DIR"
echo "Source cloned to $REPO_DIR. See README for build instructions."
