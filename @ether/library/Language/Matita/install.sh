#!/usr/bin/env bash
set -euo pipefail
# Matita - https://github.com/LPCIC/matita
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/LPCIC/matita"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/LPCIC/matita.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  opam install . --deps-only -y
  ./configure && make
  sudo make install
  exit 0
fi
command -v opam >/dev/null 2>&1 || { echo "opam required. Install OCaml/opam first." >&2; exit 1; }
opam install matita -y
