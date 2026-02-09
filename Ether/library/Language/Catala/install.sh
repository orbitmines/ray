#!/usr/bin/env bash
set -euo pipefail
if command -v opam >/dev/null 2>&1; then
  opam install catala -y
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/CatalaLang/catala"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/CatalaLang/catala.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  make build
  sudo cp _build/default/compiler/catala.exe /usr/local/bin/catala || \
    cp _build/default/compiler/catala.exe "$HOME/.local/bin/catala"
fi
