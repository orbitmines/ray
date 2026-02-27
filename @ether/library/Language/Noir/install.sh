#!/usr/bin/env bash
set -euo pipefail
# Noir: Aztec zero-knowledge proof language - https://noir-lang.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/noir-lang/noir"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/noir-lang/noir.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cargo build --release
  exit 0
fi
# Install noirup (Noir toolchain manager) and then install nargo
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
export PATH="$HOME/.nargo/bin:$PATH"
noirup
