#!/usr/bin/env bash
set -euo pipefail
echo "Probabilistic-C is a research language described in:"
echo "  https://web.stanford.edu/~ngoodman/papers/RHG-aisb.pdf"
echo "No public distribution is available. Install a C compiler as the base requirement."
if [[ "$(uname)" == "Darwin" ]]; then
  xcode-select --install 2>/dev/null || true
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y gcc
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y gcc
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm gcc
fi
