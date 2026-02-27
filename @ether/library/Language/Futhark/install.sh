#!/usr/bin/env bash
set -euo pipefail
# Install Futhark - https://futhark-lang.org/ https://github.com/diku-dk/futhark
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/diku-dk/futhark"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/diku-dk/futhark.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && stack install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install futhark
elif command -v cabal >/dev/null 2>&1; then
  cabal update && cabal install futhark
elif command -v stack >/dev/null 2>&1; then
  stack install futhark
else
  echo "Install Haskell Stack or cabal first." >&2; exit 1
fi
