#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install dmd
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y dmd || {
    # Use official installer
    curl -fsS https://dlang.org/install.sh | bash -s dmd
  }
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y dmd || {
    curl -fsS https://dlang.org/install.sh | bash -s dmd
  }
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm dmd
else
  curl -fsS https://dlang.org/install.sh | bash -s dmd
fi
