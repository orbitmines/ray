#!/usr/bin/env bash
set -euo pipefail
# SIMULA: first object-oriented language - GNU Cim compiler
if [[ "$(uname)" == "Darwin" ]]; then
  brew install cim || {
    echo "Install GNU Cim manually from https://www.gnu.org/software/cim/" >&2
    exit 1
  }
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y cim
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y cim || {
    echo "GNU Cim not in repos; build from source at https://www.gnu.org/software/cim/" >&2
    exit 1
  }
elif command -v pacman >/dev/null 2>&1; then
  echo "Install cim from AUR: yay -S cim" >&2
  exit 1
else
  echo "Unsupported package manager." >&2; exit 1
fi
