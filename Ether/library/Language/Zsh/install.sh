#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  # zsh is the default shell on macOS
  brew install zsh 2>/dev/null || true
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y zsh
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y zsh
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm zsh
else
  echo "Unsupported package manager." >&2; exit 1
fi
