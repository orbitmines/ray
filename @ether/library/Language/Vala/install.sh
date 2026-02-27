#!/usr/bin/env bash
set -euo pipefail
# Vala
if [[ "$(uname)" == "Darwin" ]]; then
  brew install vala
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y valac
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y vala
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm vala
else
  echo "Unsupported package manager. Visit https://vala.dev/" >&2; exit 1
fi
