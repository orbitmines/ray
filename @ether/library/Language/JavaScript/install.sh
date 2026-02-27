#!/usr/bin/env bash
set -euo pipefail
echo "JavaScript runs via Node.js or Bun."
if ! command -v node >/dev/null 2>&1 && ! command -v bun >/dev/null 2>&1; then
  echo "Installing Node.js..."
  if [[ "$(uname)" == "Darwin" ]]; then
    brew install node
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --noconfirm nodejs npm
  elif command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo bash -
    sudo apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y nodejs npm
  else
    echo "Unsupported package manager." >&2; exit 1
  fi
fi
