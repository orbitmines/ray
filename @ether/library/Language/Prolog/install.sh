#!/usr/bin/env bash
set -euo pipefail
# Prolog - SWI-Prolog
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing SWI-Prolog from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/SWI-Prolog/swipl-devel"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone --recurse-submodules https://github.com/SWI-Prolog/swipl-devel.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  mkdir -p build && cd build
  cmake .. -DCMAKE_INSTALL_PREFIX=/usr/local
  make -j"$(nproc)"
  sudo make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install swi-prolog
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y swi-prolog
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y swipl
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm swi-prolog
else
  echo "Unsupported package manager. Use --from-source or visit https://www.swi-prolog.org/download/stable" >&2; exit 1
fi
