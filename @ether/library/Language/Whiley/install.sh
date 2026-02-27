#!/usr/bin/env bash
set -euo pipefail
# Whiley - https://whiley.org/
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/Whiley/WhileyCompiler"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/Whiley/WhileyCompiler.git "$REPO_DIR"
fi
cd "$REPO_DIR"
command -v ant >/dev/null 2>&1 || { echo "Apache Ant required." >&2; exit 1; }
ant build
mkdir -p "$HOME/.local/bin"
ln -sf "$REPO_DIR/bin/wy" "$HOME/.local/bin/wy"
