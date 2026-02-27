#!/usr/bin/env bash
set -euo pipefail
# LaTeX - https://www.latex-project.org/get/
if [[ "$(uname)" == "Darwin" ]]; then
  brew install --cask mactex
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y texlive-full
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y texlive-scheme-full
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm texlive-most
else
  echo "Unsupported package manager." >&2; exit 1
fi
