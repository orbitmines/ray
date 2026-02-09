#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing PennyLane from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/PennyLaneAI/pennylane"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/PennyLaneAI/pennylane.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  pip install -e .
  exit 0
fi
pip install pennylane
