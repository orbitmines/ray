#!/usr/bin/env bash
set -euo pipefail
# Low-level First-order PPL - https://github.com/bayesianbrad/PyLFPPL
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/bayesianbrad/PyLFPPL"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/bayesianbrad/PyLFPPL.git "$REPO_DIR"
fi
cd "$REPO_DIR"
pip install -e .
