#!/usr/bin/env bash
set -euo pipefail
# Cairo: StarkNet smart contract language - https://www.cairo-lang.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/starkware-libs/cairo"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/starkware-libs/cairo.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cargo build --release
  exit 0
fi
# Install Scarb (Cairo package manager and build tool)
if [[ "$(uname)" == "Darwin" ]]; then
  brew install scarb || curl -fsSL https://docs.swmansion.com/scarb/install.sh | sh
elif command -v curl >/dev/null 2>&1; then
  curl -fsSL https://docs.swmansion.com/scarb/install.sh | sh
else
  # Fallback: pip install cairo-lang
  pip3 install cairo-lang
fi
