#!/usr/bin/env bash
set -euo pipefail
# LLVM - https://llvm.org/docs/GettingStarted.html
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/llvm/llvm-project"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/llvm/llvm-project.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  cmake -S llvm -B build -G "Unix Makefiles" -DCMAKE_BUILD_TYPE=Release -DLLVM_ENABLE_PROJECTS="clang"
  cmake --build build -j"$(nproc)"
  sudo cmake --install build
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install llvm
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y llvm clang
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y llvm clang
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm llvm clang
else
  echo "Unsupported package manager. Use FROM_SOURCE=true." >&2; exit 1
fi
