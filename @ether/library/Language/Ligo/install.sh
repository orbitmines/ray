#!/usr/bin/env bash
set -euo pipefail
# LIGO: Tezos smart contract language - https://ligolang.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/gitlab.com/ligolang/ligo"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://gitlab.com/ligolang/ligo.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && make
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install ligolang/ligo/ligo
elif command -v curl >/dev/null 2>&1; then
  # Download static Linux binary
  curl -fsSL https://ligolang.org/bin/linux/ligo -o /usr/local/bin/ligo 2>/dev/null || \
    sudo curl -fsSL https://ligolang.org/bin/linux/ligo -o /usr/local/bin/ligo
  chmod +x /usr/local/bin/ligo 2>/dev/null || sudo chmod +x /usr/local/bin/ligo
else
  echo "Download LIGO from: https://ligolang.org/docs/intro/installation" >&2
  exit 1
fi
