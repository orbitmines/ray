#!/usr/bin/env bash
set -euo pipefail
# Aletha - proof checker (OCaml-based)
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/aeqe/aletha"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/aeqe/aletha.git "$REPO_DIR"
fi
cd "$REPO_DIR"
if command -v opam &>/dev/null; then
  eval "$(opam env)" || true
  opam install -y . --deps-only || true
  dune build 2>/dev/null || make 2>/dev/null || true
  dune install 2>/dev/null || sudo make install 2>/dev/null || true
else
  echo "opam is required. Install OCaml/opam first." >&2; exit 1
fi
