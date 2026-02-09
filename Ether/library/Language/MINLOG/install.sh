#!/usr/bin/env bash
set -euo pipefail
# MINLOG - http://www.minlog-system.de/
# Requires Scheme (Chez Scheme or Petite Chez Scheme)
echo "MINLOG is distributed from http://www.minlog-system.de/"
echo "Download the latest version and follow the installation instructions."
echo "Requires Chez Scheme or Petite Chez Scheme."
if [[ "$(uname)" == "Darwin" ]]; then
  brew install chezscheme
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y chezscheme
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm chez-scheme
fi
