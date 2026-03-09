#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/idris-lang/Idris2"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/idris-lang/Idris2.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && make bootstrap && make install
  exit 0
fi
if command -v pack >/dev/null 2>&1; then
  pack install idris2
elif [[ "$(uname)" == "Darwin" ]]; then
  brew install idris2
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y idris2 2>/dev/null || { echo "Build from source: ether Language.Idris install --from-source" >&2; exit 1; }
else
  echo "Unsupported package manager. Use --from-source." >&2; exit 1
fi
