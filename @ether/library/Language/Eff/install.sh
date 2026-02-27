#!/usr/bin/env bash
set -euo pipefail
# Install Eff - https://www.eff-lang.org/ https://github.com/matijapretnar/eff
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/matijapretnar/eff"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/matijapretnar/eff.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && make
  exit 0
fi
# Install via opam
if command -v opam >/dev/null 2>&1; then
  eval "$(opam env)" || true
  opam install -y eff
else
  echo "opam is required. Install OCaml/opam first." >&2; exit 1
fi
