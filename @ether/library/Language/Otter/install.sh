#!/usr/bin/env bash
set -euo pipefail
echo "Installing Otter from source..."
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/theoremprover-museum/otter"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/theoremprover-museum/otter.git "$REPO_DIR"
fi
cd "$REPO_DIR"
if [[ -f Makefile ]]; then
  make -j"$(nproc)"
fi
echo "Otter source cloned to $REPO_DIR. See README for build instructions."
