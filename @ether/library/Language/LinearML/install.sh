#!/usr/bin/env bash
set -euo pipefail
# LinearML - https://github.com/pikatchu/LinearML
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/pikatchu/LinearML"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/pikatchu/LinearML.git "$REPO_DIR"
fi
cd "$REPO_DIR"
make
