#!/usr/bin/env bash
set -euo pipefail
# Meson build system
if [[ "$(uname)" == "Darwin" ]]; then
  brew install meson
elif command -v pip3 >/dev/null 2>&1; then
  pip3 install meson
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y meson
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y meson
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm meson
else
  echo "Unsupported package manager. Install via pip: pip3 install meson" >&2; exit 1
fi
