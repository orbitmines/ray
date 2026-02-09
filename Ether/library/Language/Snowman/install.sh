#!/usr/bin/env bash
set -euo pipefail
# Snowman esoteric language - https://github.com/KeyboardFire/snowman-lang
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/KeyboardFire/snowman-lang"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/KeyboardFire/snowman-lang.git "$REPO_DIR"
fi
cd "$REPO_DIR" && make
