#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install crystal
elif command -v apt-get >/dev/null 2>&1; then
  curl -fsSL https://crystal-lang.org/install.sh | sudo bash
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y crystal
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm crystal shards
else
  echo "Unsupported platform. See https://crystal-lang.org/install/" >&2; exit 1
fi
