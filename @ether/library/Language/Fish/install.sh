#!/usr/bin/env bash
set -euo pipefail
# Install ><> (Fish) esoteric language interpreter
# https://esolangs.org/wiki/Fish
# Using the Python-based interpreter
pip install fish-lang 2>/dev/null || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/TuxSH/fish-jit"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/TuxSH/fish-jit.git "$REPO_DIR" 2>/dev/null || {
      # Fallback: download fish.py interpreter directly
      mkdir -p "${ETHER_EXTERNAL_DIR:-/tmp}/fish"
      curl -fsSL "https://gist.githubusercontent.com/anonymous/6392418/raw/fish.py" -o "${ETHER_EXTERNAL_DIR:-/tmp}/fish/fish.py" 2>/dev/null || true
    }
  fi
}
echo "><> (Fish) interpreter installed."
