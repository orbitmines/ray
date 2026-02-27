#!/usr/bin/env bash
set -euo pipefail
# Koka - https://koka-lang.github.io/koka/doc/book.html#install
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/koka-lang/koka"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone --recursive https://github.com/koka-lang/koka.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  command -v stack >/dev/null 2>&1 || { echo "Haskell Stack required." >&2; exit 1; }
  stack build
  stack install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install koka
elif command -v apt-get >/dev/null 2>&1; then
  curl -sSL https://github.com/koka-lang/koka/releases/latest/download/install.sh | sh
elif command -v dnf >/dev/null 2>&1; then
  curl -sSL https://github.com/koka-lang/koka/releases/latest/download/install.sh | sh
elif command -v pacman >/dev/null 2>&1; then
  curl -sSL https://github.com/koka-lang/koka/releases/latest/download/install.sh | sh
else
  echo "Unsupported package manager. Use FROM_SOURCE=true." >&2; exit 1
fi
