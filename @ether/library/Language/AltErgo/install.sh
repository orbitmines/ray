#!/usr/bin/env bash
set -euo pipefail
# Alt-Ergo - SMT solver - https://alt-ergo.ocamlpro.com/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/OCamlPro/alt-ergo"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/OCamlPro/alt-ergo.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  if command -v opam &>/dev/null; then
    eval "$(opam env)" || true
    opam install -y . --deps-only || true
    dune build && dune install
  fi
  exit 0
fi
if command -v opam &>/dev/null; then
  eval "$(opam env)" || true
  opam install -y alt-ergo
else
  echo "opam is required. Install OCaml/opam first." >&2; exit 1
fi
