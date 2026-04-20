#!/usr/bin/env bash
set -euo pipefail
# XQuery - query language for XML
# https://www.w3.org/TR/xquery/
# BaseX is a popular open-source XQuery processor
if [[ "$(uname)" == "Darwin" ]]; then
  brew install basex
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y basex
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y basex
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm basex
else
  echo "Unsupported package manager." >&2; exit 1
fi
