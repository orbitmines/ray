#!/usr/bin/env bash
set -euo pipefail
# J language
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing J from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/jsoftware/jsource"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/jsoftware/jsource.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  ./build.sh
  echo "Built. Add the bin directory to your PATH." >&2
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install --cask j
elif command -v apt-get >/dev/null 2>&1; then
  echo "J is not in standard repos. Download from https://www.jsoftware.com/#/download" >&2; exit 1
elif command -v pacman >/dev/null 2>&1; then
  echo "Check AUR for j-language: yay -S j-language" >&2; exit 1
else
  echo "Download J from https://www.jsoftware.com/#/download" >&2; exit 1
fi
