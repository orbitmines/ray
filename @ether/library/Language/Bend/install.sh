#!/usr/bin/env bash
set -euo pipefail
# Bend - massively parallel programming language (HigherOrderCO)
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/HigherOrderCO/Bend"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/HigherOrderCO/Bend.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cargo build --release
  sudo cp target/release/bend /usr/local/bin/ || cp target/release/bend "$HOME/.local/bin/"
  exit 0
fi
cargo install bend-lang
