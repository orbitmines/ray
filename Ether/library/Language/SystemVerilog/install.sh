#!/usr/bin/env bash
set -euo pipefail
# SystemVerilog: HDL - uses Verilator as simulator/linter
# https://www.veripool.org/verilator/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/chipsalliance/verible"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/chipsalliance/verible.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && bazel build //...
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install verilator
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y verilator
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y verilator
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm verilator
else
  echo "Unsupported package manager." >&2; exit 1
fi
