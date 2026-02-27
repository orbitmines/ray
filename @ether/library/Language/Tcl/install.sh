#!/usr/bin/env bash
set -euo pipefail
# Tcl
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Tcl from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/tcl-src"
  mkdir -p "$REPO_DIR" && cd "$REPO_DIR"
  curl -LO https://prdownloads.sourceforge.net/tcl/tcl8.6.13-src.tar.gz
  tar xzf tcl8.6.13-src.tar.gz
  cd tcl8.6.13/unix
  ./configure --prefix=/usr/local
  make -j"$(nproc)"
  sudo make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install tcl-tk
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y tcl
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y tcl
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm tcl
else
  echo "Unsupported package manager. Use --from-source or visit https://www.tcl.tk/" >&2; exit 1
fi
