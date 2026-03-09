#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  xcode-select --install 2>/dev/null || true
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y gcc build-essential
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y gcc make
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm gcc make
else
  echo "Unsupported package manager." >&2; exit 1
fi
