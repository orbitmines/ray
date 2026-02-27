#!/usr/bin/env bash
set -euo pipefail
echo "Installing GolfScript from source..."
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/rkoeninger/GolfScript"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/rkoeninger/GolfScript.git "$REPO_DIR"
fi
echo "GolfScript cloned to $REPO_DIR. Requires Ruby to run."
# Ensure Ruby is available
command -v ruby >/dev/null 2>&1 || {
  echo "Ruby is required to run GolfScript. Please install Ruby first." >&2
  exit 1
}
