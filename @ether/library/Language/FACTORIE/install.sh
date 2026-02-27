#!/usr/bin/env bash
set -euo pipefail
# Install FACTORIE - https://github.com/factorie/factorie
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/factorie/factorie"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/factorie/factorie.git "$REPO_DIR"
fi
cd "$REPO_DIR"
if command -v mvn >/dev/null 2>&1; then
  mvn compile -DskipTests
else
  echo "Maven is required to build FACTORIE." >&2; exit 1
fi
