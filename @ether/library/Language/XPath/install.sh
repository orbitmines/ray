#!/usr/bin/env bash
set -euo pipefail
# XPath is a query language for XML; xmllint supports it
# https://www.w3.org/TR/xpath/
if [[ "$(uname)" == "Darwin" ]]; then
  # xmllint preinstalled on macOS
  true
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y libxml2-utils
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y libxml2
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm libxml2
fi
