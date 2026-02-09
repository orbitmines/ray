#!/usr/bin/env bash
set -euo pipefail
echo "Installing Granule from source..."
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/granule-project/granule"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/granule-project/granule.git "$REPO_DIR"
fi
cd "$REPO_DIR" && stack build && stack install
