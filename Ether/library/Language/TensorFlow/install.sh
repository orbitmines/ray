#!/usr/bin/env bash
set -euo pipefail
# TensorFlow: ML framework - https://www.tensorflow.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/tensorflow/tensorflow"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/tensorflow/tensorflow.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && ./configure && bazel build //tensorflow/tools/pip_package:wheel
  exit 0
fi
pip install tensorflow
