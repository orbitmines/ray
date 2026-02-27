#!/usr/bin/env bash
set -euo pipefail
if command -v cubical >/dev/null 2>&1; then
  exec cubical "$1"
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/mortberg/cubicaltt"
  cd "$REPO_DIR"
  cabal run cubical -- "$1"
fi
