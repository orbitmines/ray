#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/mmirman/caledon"
cd "$REPO_DIR"
cabal run caledon -- "$1"
