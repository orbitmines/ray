#!/usr/bin/env bash
set -euo pipefail
# Install opam (OCaml package manager) - https://ocaml.org/install
if [[ "$(uname)" == "Darwin" ]]; then
  brew install opam
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y opam
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y opam
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm opam
else
  echo "Unsupported package manager." >&2; exit 1
fi
# Initialize opam (required for a working OCaml environment)
opam init -y --auto-setup --bare
opam switch create default ocaml-base-compiler 2>/dev/null || true
eval "$(opam env)"
