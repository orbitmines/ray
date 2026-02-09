#!/usr/bin/env bash
set -euo pipefail
# Lem - https://github.com/rems-project/lem
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/rems-project/lem"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/rems-project/lem.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  opam install . --deps-only -y
  make
  make install
  exit 0
fi
# Official install via opam
command -v opam >/dev/null 2>&1 || { echo "opam required. Install OCaml/opam first." >&2; exit 1; }
opam install lem -y
