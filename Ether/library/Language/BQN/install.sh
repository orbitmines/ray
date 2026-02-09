#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/dzaima/CBQN"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/dzaima/CBQN.git "$REPO_DIR"
fi
cd "$REPO_DIR"
make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
sudo cp BQN /usr/local/bin/bqn || cp BQN "$HOME/.local/bin/bqn"
