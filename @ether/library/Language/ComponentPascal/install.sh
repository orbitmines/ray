#!/usr/bin/env bash
set -euo pipefail
# Component Pascal is implemented by BlackBox Component Builder.
# Free Pascal can compile some Component Pascal constructs.
if [[ "$(uname)" == "Darwin" ]]; then
  brew install fpc
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y fp-compiler
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y fpc
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm fpc
else
  echo "Unsupported package manager. Install Free Pascal manually." >&2; exit 1
fi
