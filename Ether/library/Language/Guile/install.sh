#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing GNU Guile from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/gnu/guile"
  mkdir -p "$REPO_DIR"
  cd "$REPO_DIR"
  curl -fsSL https://ftp.gnu.org/gnu/guile/guile-3.0.10.tar.xz -o guile.tar.xz
  tar xf guile.tar.xz --strip-components=1
  ./configure --prefix="$HOME/.local" && make -j"$(nproc)" && make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install guile
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y guile-3.0
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y guile30
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm guile
else
  echo "Unsupported package manager. Use --from-source." >&2; exit 1
fi
