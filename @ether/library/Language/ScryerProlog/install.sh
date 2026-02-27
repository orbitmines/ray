#!/usr/bin/env bash
set -euo pipefail
# Scryer Prolog: ISO Prolog in Rust - https://www.scryer.pl/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/mthom/scryer-prolog"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/mthom/scryer-prolog.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cargo build --release
  cp target/release/scryer-prolog "$HOME/.local/bin/" 2>/dev/null || sudo cp target/release/scryer-prolog /usr/local/bin/
  exit 0
fi
cargo install scryer-prolog
