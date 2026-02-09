#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Pact from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/kadena-io/pact"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/kadena-io/pact.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  cabal build
  cabal install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install kadena-io/pact/pact
elif command -v nix >/dev/null 2>&1; then
  nix profile install github:kadena-io/pact
else
  echo "Install via brew (macOS), nix, or from source." >&2; exit 1
fi
