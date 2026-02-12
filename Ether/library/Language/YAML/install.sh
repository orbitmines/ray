#!/usr/bin/env bash
set -euo pipefail
# YAML is a data serialization format; no installation required.
# yq can be installed for processing.
if [[ "$(uname)" == "Darwin" ]]; then
  brew install yq
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y yq 2>/dev/null || pip install yq
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y yq 2>/dev/null || pip install yq
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm yq 2>/dev/null || pip install yq
fi
