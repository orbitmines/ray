#!/usr/bin/env bash
set -euo pipefail
# Apache Thrift: RPC framework - https://thrift.apache.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/apache/thrift"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/apache/thrift.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && ./bootstrap.sh && ./configure && make -j"$(nproc)" && sudo make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install thrift
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y thrift-compiler
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y thrift
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm thrift
else
  echo "Unsupported package manager." >&2; exit 1
fi
