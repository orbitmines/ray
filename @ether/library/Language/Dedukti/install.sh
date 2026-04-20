#!/usr/bin/env bash
set -euo pipefail
# Install Dedukti - https://github.com/Deducteam/Dedukti
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/Deducteam/Dedukti"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/Deducteam/Dedukti.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && make && make install
  exit 0
fi
# Install via opam (recommended)
if command -v opam >/dev/null 2>&1; then
  eval "$(opam env)" || true
  opam install -y dedukti
else
  echo "opam is required. Install OCaml/opam first." >&2; exit 1
fi
