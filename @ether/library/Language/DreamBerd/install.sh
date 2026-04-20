#!/usr/bin/env bash
set -euo pipefail
# Install DreamBerd - https://github.com/TodePond/DreamBerd
# DreamBerd is a satirical/esoteric language specification.
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/TodePond/DreamBerd"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/TodePond/DreamBerd.git "$REPO_DIR"
fi
echo "DreamBerd repo cloned to $REPO_DIR. This is a specification, not a runnable implementation."
