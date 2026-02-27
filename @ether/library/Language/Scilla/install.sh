#!/usr/bin/env bash
set -euo pipefail
# Scilla: smart contract language for Zilliqa - https://scilla-lang.org/
# Built from source (requires opam/OCaml)
if [[ "$(uname)" == "Darwin" ]]; then
  brew install pkg-config libffi openssl boost
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y build-essential pkg-config libffi-dev libssl-dev libboost-all-dev libgmp-dev opam
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y gcc gcc-c++ pkg-config libffi-devel openssl-devel boost-devel gmp-devel opam
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm base-devel pkg-config libffi openssl boost gmp opam
fi
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/Zilliqa/scilla"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/Zilliqa/scilla.git "$REPO_DIR"
fi
cd "$REPO_DIR"
opam init --auto-setup --yes || true
eval "$(opam env)"
make opamdep-ci && make
