#!/usr/bin/env bash
set -euo pipefail
echo "Installing GP2 from source..."
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/UoYCS-plasma/GP2"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/UoYCS-plasma/GP2.git "$REPO_DIR"
fi
cd "$REPO_DIR" && make -j"$(nproc)"
echo "GP2 built in $REPO_DIR"
