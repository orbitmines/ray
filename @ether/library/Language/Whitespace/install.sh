#!/usr/bin/env bash
set -euo pipefail
# Whitespace - esoteric language using only spaces, tabs, and newlines
# https://esolangs.org/wiki/Whitespace
# wspace is a Haskell interpreter
if command -v cabal >/dev/null 2>&1; then
  cabal update && cabal install wspace
elif command -v stack >/dev/null 2>&1; then
  stack install wspace
else
  # Use a Python implementation
  pip install whitespace
fi
