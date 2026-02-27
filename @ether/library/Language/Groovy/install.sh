#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Groovy from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/apache/groovy"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/apache/groovy.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && ./gradlew installGroovy
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install groovy
elif command -v sdk >/dev/null 2>&1; then
  sdk install groovy
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y groovy
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y groovy
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm groovy
else
  # Install via SDKMAN (official recommendation)
  curl -s "https://get.sdkman.io" | bash
  source "$HOME/.sdkman/bin/sdkman-init.sh"
  sdk install groovy
fi
