#!/usr/bin/env bash
set -euo pipefail
# PostScript - Ghostscript interpreter
if [[ "$(uname)" == "Darwin" ]]; then
  brew install ghostscript
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y ghostscript
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y ghostscript
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm ghostscript
else
  echo "Unsupported package manager. Please install Ghostscript manually." >&2; exit 1
fi
