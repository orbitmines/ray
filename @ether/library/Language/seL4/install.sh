#!/usr/bin/env bash
set -euo pipefail
# seL4 microkernel - https://sel4.systems/
# Build from source (requires cross-compilation toolchain)
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y build-essential cmake ninja-build python3 python3-pip \
    gcc-aarch64-linux-gnu g++-aarch64-linux-gnu libxml2-utils device-tree-compiler
  pip3 install sel4-deps
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y gcc gcc-c++ cmake ninja-build python3 python3-pip libxml2 dtc
  pip3 install sel4-deps
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm base-devel cmake ninja python python-pip aarch64-linux-gnu-gcc dtc libxml2
  pip3 install sel4-deps
elif [[ "$(uname)" == "Darwin" ]]; then
  brew install cmake ninja dtc libxml2 python3
  pip3 install sel4-deps
fi
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/seL4/seL4"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/seL4/seL4.git "$REPO_DIR"
fi
echo "seL4 source cloned to $REPO_DIR"
echo "Build with: cd $REPO_DIR && mkdir build && cd build && ../init-build.sh && ninja"
