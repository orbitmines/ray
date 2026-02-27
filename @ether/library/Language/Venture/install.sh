#!/usr/bin/env bash
set -euo pipefail
# Venture - probabilistic programming - https://github.com/probcomp/Venturecxx
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/probcomp/Venturecxx"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/probcomp/Venturecxx.git "$REPO_DIR"
fi
cd "$REPO_DIR"
pip install -e . || pip install .
