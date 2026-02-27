#!/usr/bin/env bash
set -euo pipefail
# Install diffSAT - https://github.com/MatthiasNickworX/diffSAT (Scala-based SAT solver)
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/MatthiasNickworX/diffSAT"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/MatthiasNickworX/diffSAT.git "$REPO_DIR"
fi
cd "$REPO_DIR"
if command -v sbt >/dev/null 2>&1; then
  sbt assembly
else
  echo "sbt (Scala Build Tool) is required. Install sbt first." >&2; exit 1
fi
