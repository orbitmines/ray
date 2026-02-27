#!/usr/bin/env bash
set -euo pipefail
# Install Formality - https://github.com/moonad/Formality
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/moonad/Formality"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/moonad/Formality.git "$REPO_DIR"
fi
cd "$REPO_DIR"
npm install 2>/dev/null || true
npm link 2>/dev/null || true
