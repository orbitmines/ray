#!/usr/bin/env bash
set -euo pipefail
# Why3 - deductive program verification platform
# https://www.why3.org/
if [[ "$(uname)" == "Darwin" ]]; then
  brew install why3 || opam install why3
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y why3
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y why3 || opam install why3
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm why3 || opam install why3
else
  # Fallback: install via opam
  command -v opam >/dev/null 2>&1 || { echo "OPAM required to install Why3." >&2; exit 1; }
  opam install why3
fi
