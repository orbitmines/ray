#!/usr/bin/env bash
set -euo pipefail
# LOLCODE - https://lolcode.org/
# lci interpreter - https://github.com/justinmeza/lci
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/justinmeza/lci"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/justinmeza/lci.git "$REPO_DIR"
fi
cd "$REPO_DIR"
cmake . && make -j"$(nproc)"
sudo make install
