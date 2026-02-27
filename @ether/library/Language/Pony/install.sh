#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Pony from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/ponylang/ponyc"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/ponylang/ponyc.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  make -j"$(nproc)"
  sudo make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install ponyc
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys E04F0923 2>/dev/null || true
  echo "deb https://dl.cloudsmith.io/public/ponylang/releases/deb/ubuntu $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/ponylang.list
  sudo apt-get update && sudo apt-get install -y ponyc
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y ponyc || {
    echo "Use --from-source for Fedora." >&2; exit 1
  }
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm ponyc
else
  echo "Unsupported package manager. Use --from-source." >&2; exit 1
fi
