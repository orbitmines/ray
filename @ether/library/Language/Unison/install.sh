#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Unison from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/unisonweb/unison"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/unisonweb/unison.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  command -v stack >/dev/null 2>&1 || { echo "Haskell Stack required. Install via: curl -sSL https://get.haskellstack.org/ | sh" >&2; exit 1; }
  stack build
  stack install
  exit 0
fi
# Official install: https://www.unison-lang.org/docs/installation/
if [[ "$(uname)" == "Darwin" ]]; then
  brew install unisonweb/unison/ucm
elif command -v apt-get >/dev/null 2>&1 || command -v dnf >/dev/null 2>&1 || command -v pacman >/dev/null 2>&1; then
  # Official Linux installer
  curl -fsSL https://github.com/unisonweb/unison/releases/latest/download/ucm-linux.tar.gz -o /tmp/ucm-linux.tar.gz
  mkdir -p "$HOME/.local/bin"
  tar -xzf /tmp/ucm-linux.tar.gz -C "$HOME/.local/bin"
  rm -f /tmp/ucm-linux.tar.gz
else
  echo "Unsupported platform. Use --from-source." >&2; exit 1
fi
