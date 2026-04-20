#!/usr/bin/env bash
set -euo pipefail
# Motoko: Internet Computer smart contract language - https://internetcomputer.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/dfinity/motoko"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/dfinity/motoko.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && make
  exit 0
fi
# Install dfx (DFINITY Canister SDK) which includes moc (Motoko compiler)
sh -ci "$(curl -fsSL https://internetcomputer.org/install.sh)"
