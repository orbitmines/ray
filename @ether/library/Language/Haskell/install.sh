#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/ghc/ghc"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/ghc/ghc.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && ./boot && ./configure && make && make install
  exit 0
fi
curl --proto '=https' --tlsv1.2 -sSf https://get-ghcup.haskell.org | sh
