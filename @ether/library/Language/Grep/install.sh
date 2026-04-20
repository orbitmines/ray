#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing GNU grep from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/gnu/grep"
  mkdir -p "$REPO_DIR"
  cd "$REPO_DIR"
  curl -fsSL https://ftp.gnu.org/gnu/grep/grep-3.11.tar.xz -o grep.tar.xz
  tar xf grep.tar.xz --strip-components=1
  ./configure --prefix="$HOME/.local" && make -j"$(nproc)" && make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install grep
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y grep
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y grep
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm grep
else
  echo "Unsupported package manager. Use --from-source." >&2; exit 1
fi
