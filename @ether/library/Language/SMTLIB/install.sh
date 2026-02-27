#!/usr/bin/env bash
set -euo pipefail
# SMT-LIB: standard format for SMT solvers - https://smt-lib.org/
# Install Z3 as the reference SMT solver
if [[ "$(uname)" == "Darwin" ]]; then
  brew install z3
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y z3
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y z3
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm z3
else
  echo "Unsupported package manager." >&2; exit 1
fi
