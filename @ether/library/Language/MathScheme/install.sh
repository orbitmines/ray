#!/usr/bin/env bash
set -euo pipefail
# MathScheme - https://github.com/JacquesCarette/MathScheme
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/JacquesCarette/MathScheme"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/JacquesCarette/MathScheme.git "$REPO_DIR"
fi
echo "MathScheme source cloned to: $REPO_DIR"
echo "See the repository README for build instructions."
