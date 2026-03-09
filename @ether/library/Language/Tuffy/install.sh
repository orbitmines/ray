#!/usr/bin/env bash
set -euo pipefail
# Tuffy: Markov Logic Network inference - https://github.com/HazyResearch/tuffy
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/HazyResearch/tuffy"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/HazyResearch/tuffy.git "$REPO_DIR"
fi
echo "Tuffy cloned to $REPO_DIR"
echo "Requires Java and PostgreSQL. See README for setup instructions."
