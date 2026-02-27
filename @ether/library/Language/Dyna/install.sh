#!/usr/bin/env bash
set -euo pipefail
# Install Dyna - a weighted logic programming language
# https://github.com/nwf/dyna
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/nwf/dyna"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/nwf/dyna.git "$REPO_DIR"
fi
cd "$REPO_DIR"
pip install -e . 2>/dev/null || {
  echo "Dyna requires Python. Install dependencies manually from $REPO_DIR" >&2
}
