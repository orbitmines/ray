#!/usr/bin/env bash
set -euo pipefail
echo "Installing Hylo from source..."
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/hylo-lang/hylo"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/hylo-lang/hylo.git "$REPO_DIR"
fi
cd "$REPO_DIR" && swift build -c release
echo "Hylo built. Binary at $REPO_DIR/.build/release/"
