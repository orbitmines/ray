#!/usr/bin/env bash
set -euo pipefail
# Kitten - https://kittenlang.org/ - built from source (Haskell/Stack project)
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/evincarofautumn/kitten"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/evincarofautumn/kitten.git "$REPO_DIR"
fi
cd "$REPO_DIR"
command -v stack >/dev/null 2>&1 || { echo "Haskell Stack required. Install via: curl -sSL https://get.haskellstack.org/ | sh" >&2; exit 1; }
stack build
stack install
