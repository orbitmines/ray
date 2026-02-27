#!/usr/bin/env bash
set -euo pipefail
# Official install: https://nodejs.org/en/download
if [[ "$(uname)" == "Darwin" ]]; then
  brew install node
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm nodejs npm
elif command -v apt-get >/dev/null 2>&1; then
  # Default apt nodejs is outdated; use NodeSource LTS repo
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo bash -
  sudo apt-get install -y nodejs
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y nodejs npm
else
  # Fallback: fnm (Fast Node Manager)
  curl -fsSL https://fnm.vercel.app/install | bash
  export PATH="$HOME/.local/share/fnm:$PATH"
  eval "$(fnm env)"
  fnm install --lts
fi
