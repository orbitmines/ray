#!/usr/bin/env bash
set -euo pipefail
# Raku (formerly Perl 6) - Rakudo
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Rakudo from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/rakudo/rakudo"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/rakudo/rakudo.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  perl Configure.pl --gen-moar --gen-nqp --backends=moar
  make -j"$(nproc)"
  sudo make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install rakudo
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y rakudo
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y rakudo
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm rakudo
else
  echo "Unsupported package manager. Use --from-source or visit https://rakudo.org/downloads" >&2; exit 1
fi
