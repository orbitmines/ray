#!/usr/bin/env bash
set -euo pipefail
# Official install: https://dart.dev/get-dart
if [[ "$(uname)" == "Darwin" ]]; then
  brew tap dart-lang/dart && brew install dart
elif command -v apt-get >/dev/null 2>&1; then
  if [[ ! -f /usr/share/keyrings/dart.gpg ]]; then
    sudo apt-get update && sudo apt-get install -y apt-transport-https
    wget -qO- https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo gpg --yes --dearmor -o /usr/share/keyrings/dart.gpg
    echo "deb [signed-by=/usr/share/keyrings/dart.gpg arch=$(dpkg --print-architecture)] https://storage.googleapis.com/download.dartlang.org/linux/debian stable main" | sudo tee /etc/apt/sources.list.d/dart_stable.list > /dev/null
    sudo apt-get update
  fi
  sudo apt-get install -y dart
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm dart
else
  echo "Unsupported package manager." >&2; exit 1
fi
