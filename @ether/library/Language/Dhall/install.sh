#!/usr/bin/env bash
set -euo pipefail
# Install Dhall - https://dhall-lang.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/dhall-lang/dhall-haskell"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/dhall-lang/dhall-haskell.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && stack install dhall
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install dhall
elif command -v cabal >/dev/null 2>&1; then
  cabal update && cabal install dhall
elif command -v stack >/dev/null 2>&1; then
  stack install dhall
else
  echo "Install Haskell Stack or cabal first." >&2; exit 1
fi
