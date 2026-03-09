#!/usr/bin/env bash
set -euo pipefail
# AWK - text processing language (GNU awk)
if [[ "$(uname)" == "Darwin" ]]; then
  brew install gawk
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y gawk
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y gawk
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm gawk
fi
