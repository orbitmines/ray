#!/usr/bin/env bash
set -euo pipefail
# BayesDB - probabilistic database (bayeslite)
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/probcomp/bayeslite"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/probcomp/bayeslite.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && pip install .
  exit 0
fi
pip install bayeslite
