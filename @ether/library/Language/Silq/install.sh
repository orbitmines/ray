#!/usr/bin/env bash
set -euo pipefail
# Silq: high-level quantum programming language - https://silq.ethz.ch/
# Requires D compiler (LDC)
if [[ "$(uname)" == "Darwin" ]]; then
  brew install ldc dub
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y ldc dub gcc zlib1g-dev
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y ldc dub gcc zlib-devel
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm ldc dub gcc zlib
fi
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/eth-sri/silq"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/eth-sri/silq.git "$REPO_DIR"
fi
cd "$REPO_DIR" && make -j"$(nproc)"
