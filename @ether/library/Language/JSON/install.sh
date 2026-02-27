#!/usr/bin/env bash
set -euo pipefail
# JSON is a data format. No installation required.
# Optionally install jq for command-line processing.
if [[ "$(uname)" == "Darwin" ]]; then
  brew install jq
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y jq
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y jq
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm jq
fi
