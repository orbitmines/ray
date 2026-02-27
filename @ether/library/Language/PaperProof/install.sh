#!/usr/bin/env bash
set -euo pipefail
echo "Installing PaperProof from source..."
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/Paper-Proof/paperproof"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/Paper-Proof/paperproof.git "$REPO_DIR"
fi
cd "$REPO_DIR"
npm install
echo "PaperProof installed at $REPO_DIR."
