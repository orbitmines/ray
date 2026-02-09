#!/usr/bin/env bash
set -euo pipefail
echo "Installing NQTHM from source..."
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/John-Nagle/nqthm"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/John-Nagle/nqthm.git "$REPO_DIR"
fi
echo "NQTHM source cloned to $REPO_DIR. Requires a Common Lisp implementation to build."
echo "See $REPO_DIR for build instructions."
