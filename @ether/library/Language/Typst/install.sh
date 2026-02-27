#!/usr/bin/env bash
set -euo pipefail
# Typst - modern typesetting system
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Typst from source via cargo..."
  cargo install --git https://github.com/typst/typst --locked typst-cli
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install typst
elif command -v cargo >/dev/null 2>&1; then
  cargo install typst-cli
elif command -v apt-get >/dev/null 2>&1; then
  echo "Typst is not in standard repos. Install via cargo: cargo install typst-cli" >&2
  echo "Or download from https://github.com/typst/typst/releases" >&2; exit 1
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm typst
else
  echo "Install via cargo: cargo install typst-cli" >&2
  echo "Or download from https://github.com/typst/typst/releases" >&2; exit 1
fi
