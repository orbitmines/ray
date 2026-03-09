#!/usr/bin/env bash
set -euo pipefail
# Austral - language with linear types
# Requires opam/OCaml to build from source
if command -v opam >/dev/null 2>&1; then
  eval "$(opam env)" || true
fi
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/austral/austral"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/austral/austral.git "$REPO_DIR"
fi
cd "$REPO_DIR"
if ! command -v opam >/dev/null 2>&1; then
  echo "opam is required to build Austral. Install OCaml/opam first." >&2
  exit 1
fi
eval "$(opam env)"
opam install -y --deps-only . || true
make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
sudo make install || cp austral "$HOME/.local/bin/"
