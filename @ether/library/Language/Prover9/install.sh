#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/theoremprover-museum/prover9"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/theoremprover-museum/prover9.git "$REPO_DIR"
fi
cd "$REPO_DIR"
make all
sudo cp bin/* /usr/local/bin/ || cp bin/* "$HOME/.local/bin/"
