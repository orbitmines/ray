#!/usr/bin/env bash
set -euo pipefail
# SPASS: automated theorem prover - https://www.mpi-inf.mpg.de/departments/automation-of-logic/software/spass-workbench/
if [[ "$(uname)" == "Darwin" ]]; then
  brew install spass || {
    echo "Download SPASS from https://www.mpi-inf.mpg.de/departments/automation-of-logic/software/spass-workbench/" >&2
    exit 1
  }
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y spass
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y spass || {
    echo "Download SPASS from https://www.mpi-inf.mpg.de/departments/automation-of-logic/software/spass-workbench/" >&2
    exit 1
  }
elif command -v pacman >/dev/null 2>&1; then
  echo "Install spass from AUR: yay -S spass" >&2
  exit 1
else
  echo "Unsupported package manager." >&2; exit 1
fi
