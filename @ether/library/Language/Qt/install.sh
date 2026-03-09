#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install qt
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y qtbase5-dev qtchooser qt5-qmake qtbase5-dev-tools
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y qt5-qtbase-devel
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm qt5-base
else
  echo "Unsupported package manager." >&2; exit 1
fi
