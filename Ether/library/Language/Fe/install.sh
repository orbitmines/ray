#!/usr/bin/env bash
set -euo pipefail
# Fe: Ethereum smart contract language - https://fe-lang.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/ethereum/fe"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/ethereum/fe.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cargo build --release
  exit 0
fi
if command -v cargo >/dev/null 2>&1; then
  cargo install fe
else
  # Download pre-built binary from GitHub releases
  OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  ARCH="$(uname -m)"
  echo "Download Fe from: https://github.com/ethereum/fe/releases" >&2
  echo "Select the binary for ${OS}-${ARCH}" >&2
  exit 1
fi
