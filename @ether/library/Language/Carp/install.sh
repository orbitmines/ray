#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/carp-lang/Carp"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/carp-lang/Carp.git "$REPO_DIR"
fi
cd "$REPO_DIR"
if command -v stack >/dev/null 2>&1; then
  stack build && stack install
elif command -v cabal >/dev/null 2>&1; then
  cabal update && cabal build && cabal install
else
  echo "Install Haskell Stack or cabal first." >&2; exit 1
fi
