#!/usr/bin/env bash
set -euo pipefail
# Plutus: Cardano smart contract language - https://plutus.cardano.intersectmbo.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/IntersectMBO/plutus"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/IntersectMBO/plutus.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cabal build all
  exit 0
fi
# Plutus requires GHC and Cabal
if ! command -v ghc >/dev/null 2>&1; then
  echo "GHC is required. Install via ghcup: curl --proto '=https' --tlsv1.2 -sSf https://get-ghcup.haskell.org | sh" >&2
  exit 1
fi
if ! command -v cabal >/dev/null 2>&1; then
  echo "Cabal is required. Install via ghcup: ghcup install cabal" >&2
  exit 1
fi
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/IntersectMBO/plutus"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/IntersectMBO/plutus.git "$REPO_DIR"
fi
cd "$REPO_DIR" && cabal build all
