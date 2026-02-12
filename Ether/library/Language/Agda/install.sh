#!/usr/bin/env bash
set -euo pipefail
if command -v cabal >/dev/null 2>&1; then
  cabal update && cabal install Agda
elif command -v stack >/dev/null 2>&1; then
  stack install Agda
elif [[ "$(uname)" == "Darwin" ]]; then
  brew install agda
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y agda
else
  echo "Install GHC/cabal first, then: cabal install Agda" >&2; exit 1
fi
