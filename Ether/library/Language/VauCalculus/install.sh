#!/usr/bin/env bash
set -euo pipefail
# Vau Calculus - https://github.com/breckinloggins/vau
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/breckinloggins/vau"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/breckinloggins/vau.git "$REPO_DIR"
fi
cd "$REPO_DIR"
make || gcc -o vau vau.c
mkdir -p "$HOME/.local/bin"
cp vau "$HOME/.local/bin/" || true
