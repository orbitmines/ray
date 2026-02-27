#!/usr/bin/env bash
set -euo pipefail
# OpenSCAD - programmable CAD modeller
if [[ "$(uname)" == "Darwin" ]]; then
  brew install --cask openscad
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y openscad
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y openscad
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm openscad
else
  echo "Unsupported package manager. Download from https://openscad.org/downloads.html" >&2; exit 1
fi
