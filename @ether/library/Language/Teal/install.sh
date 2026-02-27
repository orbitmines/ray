#!/usr/bin/env bash
set -euo pipefail
# TEAL: Algorand smart contract language - https://developer.algorand.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/algorand/go-algorand"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/algorand/go-algorand.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew tap algorand/stable && brew install algorand
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y gnupg2 curl software-properties-common
  curl -o - https://releases.algorand.com/key.pub | sudo tee /etc/apt/trusted.gpg.d/algorand.asc
  sudo add-apt-repository "deb [arch=amd64] https://releases.algorand.com/deb/ stable main"
  sudo apt-get update && sudo apt-get install -y algorand
else
  echo "Download Algorand node from: https://developer.algorand.org/docs/run-a-node/setup/install/" >&2
  exit 1
fi
