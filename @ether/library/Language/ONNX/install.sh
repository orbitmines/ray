#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing ONNX from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/onnx/onnx"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/onnx/onnx.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  git submodule update --init --recursive
  pip install .
  exit 0
fi
pip install onnx
