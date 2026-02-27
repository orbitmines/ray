#!/usr/bin/env bash
set -euo pipefail
# Anglican - probabilistic programming (Clojure-based)
# Requires Leiningen (Clojure build tool)
if ! command -v lein &>/dev/null; then
  if [[ "$(uname)" == "Darwin" ]]; then
    brew install leiningen
  elif command -v apt-get &>/dev/null; then
    sudo apt-get update && sudo apt-get install -y leiningen
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y leiningen
  elif command -v pacman &>/dev/null; then
    sudo pacman -S --noconfirm leiningen
  else
    echo "Please install Leiningen first: https://leiningen.org/" >&2; exit 1
  fi
fi
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/probprog/anglican"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/probprog/anglican.git "$REPO_DIR"
fi
cd "$REPO_DIR"
lein install
