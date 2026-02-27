#!/usr/bin/env bash
set -euo pipefail
# Cadence: Flow blockchain smart contract language - https://cadence-lang.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/onflow/cadence"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/onflow/cadence.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && go build ./...
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install flow-cli
else
  sh -ci "$(curl -fsSL https://raw.githubusercontent.com/onflow/flow-cli/master/install.sh)"
fi
