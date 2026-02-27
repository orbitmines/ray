#!/usr/bin/env bash
set -euo pipefail
# Install Fortran (gfortran) - https://fortran-lang.org/
if [[ "$(uname)" == "Darwin" ]]; then
  brew install gcc
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y gfortran
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y gcc-gfortran
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm gcc-fortran
else
  echo "Unsupported package manager." >&2; exit 1
fi
