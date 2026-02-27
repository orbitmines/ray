#!/usr/bin/env bash
set -euo pipefail
# Rhombus is part of Racket; install Racket to use Rhombus
if [[ "$(uname)" == "Darwin" ]]; then
  brew install --cask racket
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y racket
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y racket
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm racket
else
  echo "Unsupported package manager." >&2; exit 1
fi
raco pkg install --auto rhombus || true
