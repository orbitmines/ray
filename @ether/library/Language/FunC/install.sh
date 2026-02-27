#!/usr/bin/env bash
set -euo pipefail
# FunC: TON blockchain low-level smart contract language - https://docs.ton.org/develop/func/overview
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/ton-blockchain/ton"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone --recursive https://github.com/ton-blockchain/ton.git "$REPO_DIR"
fi
cd "$REPO_DIR" && mkdir -p build && cd build && cmake .. -DCMAKE_BUILD_TYPE=Release && make -j"$(nproc)" func
