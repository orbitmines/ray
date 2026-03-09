#!/usr/bin/env bash
set -euo pipefail
echo "Installing iProver from source..."
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/gitlab.com/korovin/iprover"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://gitlab.com/korovin/iprover.git "$REPO_DIR"
fi
cd "$REPO_DIR" && ./configure && make
echo "iProver built in $REPO_DIR"
