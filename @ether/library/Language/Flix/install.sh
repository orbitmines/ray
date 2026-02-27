#!/usr/bin/env bash
set -euo pipefail
# Install Flix - https://flix.dev/ https://github.com/flix/flix
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/flix/flix"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/flix/flix.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && gradle build -x test
  exit 0
fi
# Download the Flix jar
VERSION=$(curl -sSL https://api.github.com/repos/flix/flix/releases/latest | grep tag_name | cut -d'"' -f4)
mkdir -p "$HOME/.flix"
curl -fsSL "https://github.com/flix/flix/releases/download/${VERSION}/flix.jar" -o "$HOME/.flix/flix.jar"
echo "Flix installed to $HOME/.flix/flix.jar"
echo "Run with: java -jar $HOME/.flix/flix.jar"
