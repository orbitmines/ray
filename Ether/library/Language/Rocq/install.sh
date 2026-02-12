#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install coq
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y coq
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y coq
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm coq
elif command -v opam >/dev/null 2>&1; then
  opam install coq
else
  echo "Unsupported package manager." >&2; exit 1
fi
