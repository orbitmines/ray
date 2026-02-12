#!/usr/bin/env bash
set -euo pipefail
# SL language - https://github.com/sl-lang/sll
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/sl-lang/sll"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/sl-lang/sll.git "$REPO_DIR"
fi
cd "$REPO_DIR" && make -j"$(nproc)" || cmake -B build && cmake --build build
