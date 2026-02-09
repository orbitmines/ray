#!/usr/bin/env bash
set -euo pipefail
# TensorFlow Probability - https://github.com/tensorflow/probability
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/tensorflow/probability"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/tensorflow/probability.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && pip install .
  exit 0
fi
pip install tensorflow-probability
