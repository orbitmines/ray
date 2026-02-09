#!/usr/bin/env bash
set -euo pipefail
# MiniZinc - https://www.minizinc.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/MiniZinc/libminizinc"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/MiniZinc/libminizinc.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  mkdir -p build && cd build
  cmake -DCMAKE_BUILD_TYPE=Release .. && cmake --build . -j"$(nproc)"
  sudo cmake --install .
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install minizinc
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y minizinc
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm minizinc
else
  echo "Download from: https://www.minizinc.org/software.html" >&2; exit 1
fi
