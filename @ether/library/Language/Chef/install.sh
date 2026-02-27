#!/usr/bin/env bash
set -euo pipefail
# Chef is an esoteric language. Install via a Python interpreter.
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/joostrijneveld/Chef"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/joostrijneveld/Chef.git "$REPO_DIR"
fi
