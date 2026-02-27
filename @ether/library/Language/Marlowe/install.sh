#!/usr/bin/env bash
set -euo pipefail
# Marlowe: Cardano financial contract DSL - https://marlowe.iohk.io/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/input-output-hk/marlowe-cardano"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/input-output-hk/marlowe-cardano.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cabal build all
  exit 0
fi
# Marlowe requires building from source with GHC/Cabal
if ! command -v ghc >/dev/null 2>&1 || ! command -v cabal >/dev/null 2>&1; then
  echo "GHC and Cabal are required. Install via ghcup:" >&2
  echo "  curl --proto '=https' --tlsv1.2 -sSf https://get-ghcup.haskell.org | sh" >&2
  exit 1
fi
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/input-output-hk/marlowe-cardano"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/input-output-hk/marlowe-cardano.git "$REPO_DIR"
fi
cd "$REPO_DIR" && cabal build all
