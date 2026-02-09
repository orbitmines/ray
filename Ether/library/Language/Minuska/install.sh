#!/usr/bin/env bash
set -euo pipefail
# Minuska - https://github.com/h0nzZik/minuska
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/h0nzZik/minuska"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/h0nzZik/minuska.git "$REPO_DIR"
fi
cd "$REPO_DIR"
command -v opam >/dev/null 2>&1 || { echo "opam required." >&2; exit 1; }
opam install . --deps-only -y
make
