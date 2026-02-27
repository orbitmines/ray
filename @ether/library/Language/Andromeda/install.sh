#!/usr/bin/env bash
set -euo pipefail
# Andromeda - type theory with equality reflection - https://github.com/Andromedans/andromeda
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/Andromedans/andromeda"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/Andromedans/andromeda.git "$REPO_DIR"
fi
cd "$REPO_DIR"
if command -v opam &>/dev/null; then
  eval "$(opam env)" || true
  opam install -y . --deps-only || true
  if [[ -f Makefile ]]; then
    make && sudo make install || true
  elif [[ -f dune-project ]]; then
    dune build && dune install || true
  fi
else
  echo "opam is required. Install OCaml/opam first." >&2; exit 1
fi
