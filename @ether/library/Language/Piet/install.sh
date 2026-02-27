#!/usr/bin/env bash
set -euo pipefail
echo "Installing npiet (Piet interpreter)..."
if [[ "$(uname)" == "Darwin" ]]; then
  brew install npiet
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y npiet || {
    echo "npiet not in repositories. Download from https://www.bertnase.de/npiet/" >&2; exit 1
  }
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm npiet || {
    echo "npiet not in repositories. Download from https://www.bertnase.de/npiet/" >&2; exit 1
  }
else
  echo "Download npiet from https://www.bertnase.de/npiet/" >&2; exit 1
fi
