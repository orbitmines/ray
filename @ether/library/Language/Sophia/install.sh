#!/usr/bin/env bash
set -euo pipefail
# Sophia: Aeternity blockchain smart contract language - https://docs.aeternity.com/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/aeternity/aesophia"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/aeternity/aesophia.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && make
  exit 0
fi
npm install -g @aeternity/aepp-cli-js
