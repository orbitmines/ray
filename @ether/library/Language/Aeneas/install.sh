#!/usr/bin/env bash
set -euo pipefail
# Aeneas - Rust verification tool - https://github.com/AeneasVerif/aeneas
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/AeneasVerif/aeneas"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/AeneasVerif/aeneas.git "$REPO_DIR"
fi
cd "$REPO_DIR"
if command -v opam &>/dev/null; then
  eval "$(opam env)" || true
  opam install -y . --deps-only || true
  make
  sudo make install || cp -v _build/default/bin/aeneas.exe "$HOME/.local/bin/aeneas" 2>/dev/null || true
else
  echo "Aeneas requires opam. Install OCaml/opam first." >&2; exit 1
fi
