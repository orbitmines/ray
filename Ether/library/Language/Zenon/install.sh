#!/usr/bin/env bash
set -euo pipefail
# Zenon - automated theorem prover
# https://github.com/zenon-prover/zenon
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/zenon-prover/zenon"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/zenon-prover/zenon.git "$REPO_DIR"
fi
cd "$REPO_DIR"
command -v ocamlfind >/dev/null 2>&1 || command -v ocamlopt >/dev/null 2>&1 || { echo "OCaml required to build Zenon." >&2; exit 1; }
./configure && make
sudo make install || { mkdir -p "$HOME/.local/bin" && cp zenon "$HOME/.local/bin/"; }
