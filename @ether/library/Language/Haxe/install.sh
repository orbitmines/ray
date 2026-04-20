#!/usr/bin/env bash
set -euo pipefail
# Haxe
if [[ "$(uname)" == "Darwin" ]]; then
  brew install haxe
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y haxe
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y haxe
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm haxe
else
  echo "Unsupported package manager. Download from https://haxe.org/download/" >&2; exit 1
fi
