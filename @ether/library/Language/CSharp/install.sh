#!/usr/bin/env bash
set -euo pipefail
# Official install: https://dotnet.microsoft.com/en-us/download
if [[ "$(uname)" == "Darwin" ]]; then
  brew install dotnet
else
  # Use Microsoft's official install script to get latest LTS
  curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
  chmod +x /tmp/dotnet-install.sh
  /tmp/dotnet-install.sh --channel LTS
  rm -f /tmp/dotnet-install.sh
  # Add to PATH if not already there
  if ! grep -q '.dotnet' "$HOME/.profile" 2>/dev/null; then
    echo 'export DOTNET_ROOT=$HOME/.dotnet' >> "$HOME/.profile"
    echo 'export PATH=$PATH:$DOTNET_ROOT:$DOTNET_ROOT/tools' >> "$HOME/.profile"
  fi
  export DOTNET_ROOT="$HOME/.dotnet"
  export PATH="$PATH:$DOTNET_ROOT:$DOTNET_ROOT/tools"
fi
