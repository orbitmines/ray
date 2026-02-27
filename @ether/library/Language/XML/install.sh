#!/usr/bin/env bash
set -euo pipefail
# XML is a markup format; no installation required.
# xmllint is commonly available for validation.
if [[ "$(uname)" == "Darwin" ]]; then
  # libxml2 (xmllint) is preinstalled on macOS
  true
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y libxml2-utils
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y libxml2
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm libxml2
fi
