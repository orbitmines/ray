#!/usr/bin/env bash
set -euo pipefail
# Mint - https://mint-lang.com/
# https://github.com/mint-lang/mint
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/mint-lang/mint"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/mint-lang/mint.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  command -v shards >/dev/null 2>&1 || { echo "Crystal language required." >&2; exit 1; }
  shards install && crystal build src/mint.cr --release -o mint
  sudo cp mint /usr/local/bin/
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew tap aspect-build/aspect && brew install mint-lang
else
  # Install from GitHub releases
  curl -sSL https://mint-lang.com/install.sh | bash
fi
