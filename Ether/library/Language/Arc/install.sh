#!/usr/bin/env bash
set -euo pipefail
# Arc - Lisp dialect by Paul Graham - http://arclanguage.org/
# Requires Racket
if ! command -v racket &>/dev/null; then
  if [[ "$(uname)" == "Darwin" ]]; then
    brew install racket
  elif command -v apt-get &>/dev/null; then
    sudo apt-get update && sudo apt-get install -y racket
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y racket
  elif command -v pacman &>/dev/null; then
    sudo pacman -S --noconfirm racket
  else
    echo "Please install Racket first." >&2; exit 1
  fi
fi
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/arclanguage/anarern"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/arclanguage/anarern.git "$REPO_DIR"
fi
echo "Arc installed at $REPO_DIR"
echo "Run with: cd $REPO_DIR && racket -f as.scm"
