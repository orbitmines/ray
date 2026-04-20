#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install sbcl
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y sbcl
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y sbcl
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm sbcl
else
  echo "Unsupported package manager. Install SBCL manually." >&2; exit 1
fi
