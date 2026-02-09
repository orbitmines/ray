#!/usr/bin/env bash
set -euo pipefail
# Amulet - ML-like language - https://github.com/amuletml/amulet
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/amuletml/amulet"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/amuletml/amulet.git "$REPO_DIR"
fi
cd "$REPO_DIR"
if command -v stack &>/dev/null; then
  stack build
  stack install
elif command -v cabal &>/dev/null; then
  cabal update && cabal build && cabal install
else
  echo "Haskell Stack or Cabal is required." >&2; exit 1
fi
