#!/usr/bin/env bash
set -euo pipefail
# yacctt - Yet Another Cubical Type Theory
# https://github.com/mortberg/yacctt
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/mortberg/yacctt"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/mortberg/yacctt.git "$REPO_DIR"
fi
cd "$REPO_DIR"
command -v stack >/dev/null 2>&1 || { echo "Haskell Stack required." >&2; exit 1; }
stack build
stack install
