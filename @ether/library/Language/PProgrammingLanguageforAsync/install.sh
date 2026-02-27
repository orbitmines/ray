#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing P from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/p-org/P"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/p-org/P.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  dotnet build
  exit 0
fi
dotnet tool install --global P
