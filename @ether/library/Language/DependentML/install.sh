#!/usr/bin/env bash
set -euo pipefail
# DependentML is a historical research language (predecessor of ATS).
# The closest modern implementation is ATS (Applied Type System).
# Install ATS2 as the successor: https://www.ats-lang.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/githwxi/ATS-Postiats"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/githwxi/ATS-Postiats.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && ./configure && make && sudo make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install ats2-postiats
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y ats2-lang
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm ats2
else
  echo "Unsupported package manager. Use FROM_SOURCE=true." >&2; exit 1
fi
