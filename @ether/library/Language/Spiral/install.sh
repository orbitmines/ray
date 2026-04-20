#!/usr/bin/env bash
set -euo pipefail
# Spiral language - https://github.com/mrakgr/The-Spiral-Language
# Requires .NET SDK
if ! command -v dotnet >/dev/null 2>&1; then
  if [[ "$(uname)" == "Darwin" ]]; then
    brew install dotnet
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y dotnet-sdk-8.0
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y dotnet-sdk-8.0
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --noconfirm dotnet-sdk
  fi
fi
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/mrakgr/The-Spiral-Language"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/mrakgr/The-Spiral-Language.git "$REPO_DIR"
fi
cd "$REPO_DIR" && dotnet build
