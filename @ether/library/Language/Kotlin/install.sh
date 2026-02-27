#!/usr/bin/env bash
set -euo pipefail
# Official methods: SDKMAN!, Homebrew, Snap (https://kotlinlang.org/docs/command-line.html)
if [[ "$(uname)" == "Darwin" ]]; then
  brew install kotlin
elif command -v sdk >/dev/null 2>&1; then
  sdk install kotlin
elif command -v snap >/dev/null 2>&1; then
  sudo snap install kotlin --classic
else
  # Install via SDKMAN! (official primary method for Unix)
  export SDKMAN_DIR="$HOME/.sdkman"
  curl -s "https://get.sdkman.io" | bash
  source "$SDKMAN_DIR/bin/sdkman-init.sh"
  sdk install kotlin
fi
