#!/usr/bin/env bash
set -euo pipefail
# Install Figaro - https://github.com/charles-river-analytics/figaro
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/charles-river-analytics/figaro"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/charles-river-analytics/figaro.git "$REPO_DIR"
fi
cd "$REPO_DIR"
if command -v sbt >/dev/null 2>&1; then
  sbt compile
else
  echo "sbt is required to build Figaro." >&2; exit 1
fi
