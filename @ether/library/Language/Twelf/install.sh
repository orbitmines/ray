#!/usr/bin/env bash
set -euo pipefail
# Twelf: logical framework - https://github.com/standardml/twelf
# Requires SML/NJ
if [[ "$(uname)" == "Darwin" ]]; then
  brew install smlnj
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y smlnj ml-lex ml-yacc
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y smlnj
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm smlnj
fi
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/standardml/twelf"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/standardml/twelf.git "$REPO_DIR"
fi
cd "$REPO_DIR" && make smlnj
