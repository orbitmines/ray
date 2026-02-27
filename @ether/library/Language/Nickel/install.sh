#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Nickel from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/tweag/nickel"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/tweag/nickel.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  cargo build --release
  cp target/release/nickel "$HOME/.local/bin/"
  exit 0
fi
if command -v nix >/dev/null 2>&1; then
  nix profile install nixpkgs#nickel
elif [[ "$(uname)" == "Darwin" ]]; then
  brew install nickel
elif command -v cargo >/dev/null 2>&1; then
  cargo install nickel-lang-cli
else
  echo "Install via nix, brew, or cargo. Or use --from-source." >&2; exit 1
fi
