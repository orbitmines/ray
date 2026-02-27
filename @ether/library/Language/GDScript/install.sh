#!/usr/bin/env bash
set -euo pipefail
# GDScript - Godot Engine
if [[ "$(uname)" == "Darwin" ]]; then
  brew install --cask godot
elif command -v apt-get >/dev/null 2>&1; then
  echo "Install Godot via snap or download from https://godotengine.org/download" >&2
  if command -v snap >/dev/null 2>&1; then
    sudo snap install godot-4
  else
    echo "snap not available. Download from https://godotengine.org/download" >&2; exit 1
  fi
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y godot
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm godot
else
  echo "Download Godot from https://godotengine.org/download" >&2; exit 1
fi
