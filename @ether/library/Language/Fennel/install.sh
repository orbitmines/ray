#!/usr/bin/env bash
set -euo pipefail
# Install Fennel - https://fennel-lang.org/ https://github.com/bakpakin/Fennel
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/bakpakin/Fennel"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/bakpakin/Fennel.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && make && sudo make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install fennel
elif command -v luarocks >/dev/null 2>&1; then
  luarocks install fennel
else
  # Download standalone script
  curl -fsSL https://fennel-lang.org/downloads/fennel-1.4.2 -o /tmp/fennel
  chmod +x /tmp/fennel && sudo mv /tmp/fennel /usr/local/bin/fennel
fi
