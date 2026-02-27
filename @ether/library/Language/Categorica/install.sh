#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/JonathanGorard/Categorica"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/JonathanGorard/Categorica.git "$REPO_DIR"
fi
echo "Categorica cloned to $REPO_DIR. Requires Wolfram Language/Mathematica to use."
