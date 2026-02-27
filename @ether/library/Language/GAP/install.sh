#!/usr/bin/env bash
set -euo pipefail
# Install GAP - https://www.gap-system.org/ https://github.com/gap-system/gap
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/gap-system/gap"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/gap-system/gap.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && ./autogen.sh && ./configure && make -j"$(nproc)"
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install gap
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y gap
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y gap
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm gap
else
  echo "Unsupported package manager. Use FROM_SOURCE=true." >&2; exit 1
fi
