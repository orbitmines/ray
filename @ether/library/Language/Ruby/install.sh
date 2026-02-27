#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/ruby/ruby"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/ruby/ruby.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && autoconf && ./configure --prefix="$HOME/.local" && make -j"$(nproc)" && make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install ruby
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y ruby ruby-dev
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y ruby ruby-devel
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm ruby
else
  echo "Unsupported package manager. Use --from-source." >&2; exit 1
fi
