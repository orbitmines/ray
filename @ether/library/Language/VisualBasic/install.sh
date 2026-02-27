#!/usr/bin/env bash
set -euo pipefail
# Visual Basic .NET requires the .NET SDK
# https://learn.microsoft.com/en-us/dotnet/core/install/
if [[ "$(uname)" == "Darwin" ]]; then
  brew install --cask dotnet-sdk
elif command -v apt-get >/dev/null 2>&1; then
  # Microsoft official repo
  curl -fsSL https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/packages-microsoft-prod.deb -o /tmp/packages-microsoft-prod.deb
  sudo dpkg -i /tmp/packages-microsoft-prod.deb
  sudo apt-get update && sudo apt-get install -y dotnet-sdk-8.0
  rm -f /tmp/packages-microsoft-prod.deb
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y dotnet-sdk-8.0
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm dotnet-sdk
else
  echo "Unsupported package manager." >&2; exit 1
fi
