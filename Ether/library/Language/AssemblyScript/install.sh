#!/usr/bin/env bash
set -euo pipefail
# AssemblyScript - TypeScript to WebAssembly compiler
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/aspect-build/aspect-build-assemblyscript"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/aspect-build/aspect-build-assemblyscript.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && npm install && npm run build
  exit 0
fi
npm install -g assemblyscript
