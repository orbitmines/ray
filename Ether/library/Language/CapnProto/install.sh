#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install capnp
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y capnproto libcapnp-dev
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y capnproto capnproto-devel
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm capnproto
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/capnproto/capnproto"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/capnproto/capnproto.git "$REPO_DIR"
  fi
  cd "$REPO_DIR/c++"
  autoreconf -i && ./configure && make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
  sudo make install
fi
