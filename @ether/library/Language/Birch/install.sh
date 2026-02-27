#!/usr/bin/env bash
set -euo pipefail
# Birch - probabilistic programming language
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/lawmurray/Birch"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/lawmurray/Birch.git "$REPO_DIR"
fi
cd "$REPO_DIR"
# Install dependencies
if [[ "$(uname)" == "Darwin" ]]; then
  brew install autoconf automake libtool flex bison boost eigen libyaml
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y autoconf automake libtool flex bison libboost-all-dev libeigen3-dev libyaml-dev
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y autoconf automake libtool flex bison boost-devel eigen3-devel libyaml-devel
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm autoconf automake libtool flex bison boost eigen yaml-cpp
fi
./bootstrap && ./configure && make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
sudo make install || cp birch "$HOME/.local/bin/"
