#!/usr/bin/env bash
set -euo pipefail
# Zipperposition - superposition theorem prover
# https://github.com/sneeuwballen/zipperposition
if command -v opam >/dev/null 2>&1; then
  opam install zipperposition
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/sneeuwballen/zipperposition"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/sneeuwballen/zipperposition.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  command -v opam >/dev/null 2>&1 || { echo "OPAM required to build Zipperposition." >&2; exit 1; }
  opam install . --deps-only -y
  dune build
  dune install
fi
