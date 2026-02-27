#!/usr/bin/env bash
set -euo pipefail
# Solidity: Ethereum smart contract language - https://soliditylang.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/ethereum/solidity"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/ethereum/solidity.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && mkdir -p build && cd build && cmake .. && make -j"$(nproc)"
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew tap ethereum/ethereum && brew install solidity
elif command -v apt-get >/dev/null 2>&1; then
  sudo add-apt-repository -y ppa:ethereum/ethereum 2>/dev/null || true
  sudo apt-get update && sudo apt-get install -y solc
elif command -v snap >/dev/null 2>&1; then
  sudo snap install solc
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm solidity
else
  # Fallback: npm install
  npm install -g solc
fi
