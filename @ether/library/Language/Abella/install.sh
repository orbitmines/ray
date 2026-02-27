#!/usr/bin/env bash
set -euo pipefail
# Abella - interactive theorem prover - https://abella-prover.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/abella-prover/abella"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/abella-prover/abella.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  if command -v opam &>/dev/null; then
    eval "$(opam env)" || true
    opam install -y . --deps-only || true
  fi
  make && sudo make install || true
  exit 0
fi
if command -v opam &>/dev/null; then
  eval "$(opam env)" || true
  opam install -y abella
else
  echo "opam is required. Install OCaml/opam first." >&2; exit 1
fi
