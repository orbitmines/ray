#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Ott from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/ott-lang/ott"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/ott-lang/ott.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  make
  sudo make install
  exit 0
fi
if command -v opam >/dev/null 2>&1; then
  opam install ott -y
elif [[ "$(uname)" == "Darwin" ]]; then
  brew install ott
else
  echo "Install via opam: opam install ott" >&2; exit 1
fi
