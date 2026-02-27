#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Wasp from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/wasp-lang/wasp"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/wasp-lang/wasp.git "$REPO_DIR"
  fi
  cd "$REPO_DIR/waspc"
  command -v stack >/dev/null 2>&1 || { echo "Haskell Stack required." >&2; exit 1; }
  stack build && stack install
  exit 0
fi
# Official: https://wasp-lang.dev/docs/quick-start
curl -sSL https://get.wasp-lang.dev/installer.sh | sh
