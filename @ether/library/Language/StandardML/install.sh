#!/usr/bin/env bash
set -euo pipefail
# Standard ML: SML/NJ - https://www.smlnj.org/
if [[ "$(uname)" == "Darwin" ]]; then
  brew install smlnj
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y smlnj
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y smlnj || {
    echo "Download from https://www.smlnj.org/dist/working/" >&2; exit 1
  }
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm smlnj
else
  echo "Unsupported package manager." >&2; exit 1
fi
