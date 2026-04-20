#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install mit-scheme
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y mit-scheme
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y mit-scheme
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm mit-scheme
else
  echo "Unsupported package manager." >&2; exit 1
fi
