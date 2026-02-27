#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Grain from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/grain-lang/grain"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/grain-lang/grain.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && npm install && npm run build
  exit 0
fi
# Official install via npm (https://grain-lang.org/docs/getting_grain)
if command -v npm >/dev/null 2>&1; then
  npm install -g @grain/cli
else
  echo "npm is required to install Grain. Install Node.js first." >&2
  exit 1
fi
