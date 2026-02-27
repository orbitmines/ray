#!/usr/bin/env bash
set -euo pipefail
echo "OMDoc is an XML-based markup format for mathematical documents."
echo "No runtime installation required."
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/OMDoc/OMDoc"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/OMDoc/OMDoc.git "$REPO_DIR"
fi
echo "OMDoc schema and tools cloned to $REPO_DIR"
