#!/usr/bin/env bash
set -euo pipefail
# ASN.1 tools - asn1c compiler
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/vlm/asn1c"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/vlm/asn1c.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  autoreconf -iv
  ./configure --prefix="$HOME/.local"
  make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
  make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install asn1c
elif command -v apt-get &>/dev/null; then
  sudo apt-get update && sudo apt-get install -y asn1c
elif command -v dnf &>/dev/null; then
  sudo dnf install -y asn1c
elif command -v pacman &>/dev/null; then
  sudo pacman -S --noconfirm asn1c
else
  echo "Unsupported package manager. Use FROM_SOURCE=true." >&2; exit 1
fi
