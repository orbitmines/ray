#!/usr/bin/env bash
set -euo pipefail
# Install F# (via .NET SDK) - https://fsharp.org/ https://dotnet.microsoft.com/download
if [[ "$(uname)" == "Darwin" ]]; then
  brew install --cask dotnet-sdk
elif command -v apt-get >/dev/null 2>&1; then
  # Microsoft official repo - https://learn.microsoft.com/en-us/dotnet/core/install/linux-ubuntu
  sudo apt-get update && sudo apt-get install -y dotnet-sdk-8.0 2>/dev/null || {
    wget -q https://dot.net/v1/dotnet-install.sh -O /tmp/dotnet-install.sh
    chmod +x /tmp/dotnet-install.sh && /tmp/dotnet-install.sh --channel LTS
    rm -f /tmp/dotnet-install.sh
  }
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y dotnet-sdk-8.0
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm dotnet-sdk
else
  wget -q https://dot.net/v1/dotnet-install.sh -O /tmp/dotnet-install.sh
  chmod +x /tmp/dotnet-install.sh && /tmp/dotnet-install.sh --channel LTS
  rm -f /tmp/dotnet-install.sh
fi
