#!/usr/bin/env bash
set -euo pipefail
# Blang - Bayesian language (Java-based)
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/UBC-Stat-ML/blangSDK"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/UBC-Stat-ML/blangSDK.git "$REPO_DIR"
fi
cd "$REPO_DIR"
if command -v java >/dev/null 2>&1; then
  ./gradlew installDist || ./setup
else
  echo "Java is required to build Blang." >&2; exit 1
fi
