#!/usr/bin/env bash
set -euo pipefail
echo "Installing Nit from source..."
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/nitlang/nit"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/nitlang/nit.git "$REPO_DIR"
fi
cd "$REPO_DIR"
make
. misc/nit_env.sh
