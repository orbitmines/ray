#!/usr/bin/env bash
set -euo pipefail
# Shen language - https://shenlanguage.org/
# ShenRuby, Shen/Scheme, or official Shen/SBCL port
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/Shen-Language/shen-cl"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/Shen-Language/shen-cl.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && make fetch && make
  exit 0
fi
# Install via pre-built SBCL port
if [[ "$(uname)" == "Darwin" ]]; then
  brew install sbcl
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y sbcl
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y sbcl
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm sbcl
fi
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/Shen-Language/shen-cl"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/Shen-Language/shen-cl.git "$REPO_DIR"
fi
cd "$REPO_DIR" && make fetch && make
