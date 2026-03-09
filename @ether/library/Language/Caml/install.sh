#!/usr/bin/env bash
set -euo pipefail
# Caml Light is the predecessor of OCaml. Install OCaml which includes backward compatibility.
if [[ "$(uname)" == "Darwin" ]]; then
  brew install ocaml
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y ocaml
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y ocaml
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm ocaml
else
  echo "Unsupported package manager." >&2; exit 1
fi
