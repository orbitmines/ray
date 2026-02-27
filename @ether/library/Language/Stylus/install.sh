#!/usr/bin/env bash
set -euo pipefail
# Stylus: CSS preprocessor - https://stylus-lang.com/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/stylus/stylus"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/stylus/stylus.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && npm install && npm link
  exit 0
fi
npm install -g stylus
