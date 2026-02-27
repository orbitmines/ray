#!/usr/bin/env bash
set -euo pipefail
echo "Installing Narya from source..."
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/mikeshulman/narya"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/mikeshulman/narya.git "$REPO_DIR"
fi
cd "$REPO_DIR"
opam install . --deps-only -y
dune build
dune install
