#!/usr/bin/env bash
set -euo pipefail
echo "Installing HOL from source..."
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/HOL-Theorem-Prover/HOL"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/HOL-Theorem-Prover/HOL.git "$REPO_DIR"
fi
cd "$REPO_DIR" && poly < tools/smart-configure.sml && bin/build
