#!/usr/bin/env bash
set -euo pipefail
pip install chyp || pip3 install chyp || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/akissinger/chyp"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/akissinger/chyp.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  pip install -e . || pip3 install -e .
}
