#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Z3 from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/Z3Prover/z3"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/Z3Prover/z3.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  python3 scripts/mk_make.py
  cd build && make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)" && sudo make install
  exit 0
fi
# Official: https://github.com/Z3Prover/z3
if [[ "$(uname)" == "Darwin" ]]; then
  brew install z3
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y z3
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y z3
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm z3
else
  pip install z3-solver
fi
