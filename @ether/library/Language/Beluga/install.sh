#!/usr/bin/env bash
set -euo pipefail
# Beluga - proof assistant for reasoning with higher-order abstract syntax
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/Beluga-lang/Beluga"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/Beluga-lang/Beluga.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  if command -v opam >/dev/null 2>&1; then
    eval "$(opam env)"
    opam install -y --deps-only . || true
  fi
  make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
  sudo make install || cp bin/beluga "$HOME/.local/bin/"
  exit 0
fi
# Install via opam (recommended)
if command -v opam >/dev/null 2>&1; then
  eval "$(opam env)" || true
  opam install -y beluga
else
  echo "opam is required. Install OCaml/opam first." >&2; exit 1
fi
