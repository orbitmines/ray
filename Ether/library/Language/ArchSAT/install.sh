#!/usr/bin/env bash
set -euo pipefail
# ArchSAT - SAT/SMT solver with proof output
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/Gbury/archsat"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/Gbury/archsat.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  if command -v opam &>/dev/null; then
    eval "$(opam env)" || true
    opam install -y . --deps-only || true
    make && sudo make install || true
  fi
  exit 0
fi
if command -v opam &>/dev/null; then
  eval "$(opam env)" || true
  opam install -y archsat
else
  echo "opam is required. Install OCaml/opam first." >&2; exit 1
fi
