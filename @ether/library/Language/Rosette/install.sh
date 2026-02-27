#!/usr/bin/env bash
set -euo pipefail
# Rosette requires Racket
if ! command -v racket >/dev/null 2>&1; then
  if [[ "$(uname)" == "Darwin" ]]; then
    brew install --cask racket
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y racket
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y racket
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --noconfirm racket
  fi
fi
raco pkg install --auto rosette
