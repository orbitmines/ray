#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Pkl from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/apple/pkl"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/apple/pkl.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  ./gradlew build
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install pkl
elif command -v nix >/dev/null 2>&1; then
  nix profile install nixpkgs#pkl
else
  echo "Download Pkl from https://pkl-lang.org/main/current/pkl-cli/index.html#installation" >&2
  echo "Or use --from-source." >&2; exit 1
fi
