#!/usr/bin/env bash
set -euo pipefail
# TPS: Theorem Proving System - https://github.com/theoremprover-museum/TPS
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/theoremprover-museum/TPS"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/theoremprover-museum/TPS.git "$REPO_DIR"
fi
echo "TPS source cloned to $REPO_DIR"
echo "TPS requires Common Lisp (SBCL). See README in the repository for build instructions."
