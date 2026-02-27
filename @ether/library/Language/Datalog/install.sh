#!/usr/bin/env bash
set -euo pipefail
# Install Souffle Datalog engine - https://souffle-lang.github.io/install
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Souffle from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/souffle-lang/souffle"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/souffle-lang/souffle.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cmake -S . -B build && cmake --build build -j"$(nproc)" && sudo cmake --install build
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install souffle-lang/souffle/souffle
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y souffle
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y souffle
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm souffle
else
  echo "Unsupported package manager. Use FROM_SOURCE=true." >&2; exit 1
fi
