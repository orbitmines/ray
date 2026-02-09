#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install octave
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y octave
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y octave
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm octave
else
  echo "Unsupported package manager." >&2; exit 1
fi
