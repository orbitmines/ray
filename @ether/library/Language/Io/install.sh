#!/usr/bin/env bash
set -euo pipefail
# Io language
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Io from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/IoLanguage/io"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/IoLanguage/io.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  mkdir -p build && cd build
  cmake ..
  make -j"$(nproc)"
  sudo make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install io
elif command -v apt-get >/dev/null 2>&1; then
  echo "Io is not in standard repos. Use --from-source to build from https://github.com/IoLanguage/io" >&2; exit 1
elif command -v pacman >/dev/null 2>&1; then
  echo "Check AUR for io-language: yay -S io-language" >&2; exit 1
else
  echo "Unsupported package manager. Use --from-source." >&2; exit 1
fi
