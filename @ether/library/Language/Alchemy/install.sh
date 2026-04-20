#!/usr/bin/env bash
set -euo pipefail
# Alchemy - probabilistic programming / Markov Logic Networks
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/furushchev/alchemy-2"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/furushchev/alchemy-2.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  if [[ -d src ]]; then
    cd src && make
    sudo cp ../bin/* /usr/local/bin/ || cp ../bin/* "$HOME/.local/bin/" || true
  fi
  exit 0
fi
pip install alchemy 2>/dev/null || pip3 install alchemy 2>/dev/null || {
  echo "pip install failed. Try FROM_SOURCE=true." >&2; exit 1
}
