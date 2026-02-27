#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/red/red"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/red/red.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  echo "Build Red from source per instructions at https://www.red-lang.org/p/getting-started.html" >&2
  exit 0
fi
# Download pre-built binary
ARCH=$(uname -m)
if [[ "$(uname)" == "Linux" ]]; then
  curl -fsSL https://static.red-lang.org/dl/auto/linux/red-latest -o /tmp/red
  chmod +x /tmp/red
  sudo cp /tmp/red /usr/local/bin/red || cp /tmp/red "$HOME/.local/bin/red"
elif [[ "$(uname)" == "Darwin" ]]; then
  curl -fsSL https://static.red-lang.org/dl/auto/mac/red-latest -o /tmp/red
  chmod +x /tmp/red
  sudo cp /tmp/red /usr/local/bin/red || cp /tmp/red "$HOME/.local/bin/red"
else
  echo "Unsupported platform." >&2; exit 1
fi
