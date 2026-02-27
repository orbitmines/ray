#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing NumPyro from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/pyro-ppl/numpyro"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/pyro-ppl/numpyro.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  pip install .
  exit 0
fi
pip install numpyro
