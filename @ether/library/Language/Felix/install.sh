#!/usr/bin/env bash
set -euo pipefail
# Install Felix - https://github.com/felix-lang/felix
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/felix-lang/felix"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/felix-lang/felix.git "$REPO_DIR"
fi
cd "$REPO_DIR" && make build && sudo make install
