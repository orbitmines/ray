#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing JetBrains MPS from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/JetBrains/MPS"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/JetBrains/MPS.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && ./gradlew build
  exit 0
fi
# Official download from JetBrains (https://www.jetbrains.com/mps/download/)
if [[ "$(uname)" == "Darwin" ]]; then
  brew install --cask mps
elif [[ "$(uname)" == "Linux" ]]; then
  echo "Download JetBrains MPS from: https://www.jetbrains.com/mps/download/"
  echo "Or use JetBrains Toolbox: https://www.jetbrains.com/toolbox-app/"
  exit 1
else
  echo "Unsupported platform." >&2; exit 1
fi
