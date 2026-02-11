#!/usr/bin/env bash
set -euo pipefail
# Tact: TON blockchain smart contract language - https://tact-lang.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/tact-lang/tact"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/tact-lang/tact.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && npm install && npm run build
  exit 0
fi
npm install -g @tact-lang/compiler
